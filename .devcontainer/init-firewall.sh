#!/bin/bash
# Default-deny egress firewall for the opencode sandbox.
# No host/LAN access, no open SSH, DNS only to the configured resolver, IPv6 blocked.
# Which providers are allowed is set at BUILD time (root-owned /etc/firewall.conf).
#
# CHANGED: the script now FAILS CLOSED. Everything is locked down in step 0,
# before anything that can fail (config parsing, DNS lookups, curl). Previously the
# DROP policies were set at the very end, so any error under `set -e` left the
# container with a wide-open network.
set -euo pipefail

# ---- step 0: lock everything down FIRST ------------------------------------
iptables -P INPUT   DROP
iptables -P FORWARD DROP
iptables -P OUTPUT  DROP

# CHANGED: IPv6 failures are no longer silently ignored (`|| true` is gone).
# If ip6tables doesn't work, we only continue when the container has no global
# IPv6 address anyway (the usual Docker default); otherwise we abort.
if ip6tables -P INPUT DROP 2>/dev/null \
   && ip6tables -P FORWARD DROP \
   && ip6tables -P OUTPUT DROP; then
  ip6tables -F
elif [ -z "$(ip -6 addr show scope global 2>/dev/null)" ]; then
  echo "WARN: ip6tables unavailable, but no global IPv6 address present; continuing"
else
  echo "ERROR: could not lock down IPv6"; exit 1
fi

# ---- provider name -> domains ----------------------------------------------
declare -A PROVIDER_DOMAINS=(
  [anthropic]="api.anthropic.com"
  [openai]="api.openai.com"
  [opencode]="opencode.ai"                         # OpenCode Zen/Go gateway (incl. free Zen models)
  [openrouter]="openrouter.ai"                     # has :free models
  # NOTE: google sits on shared Google IPs, so allowing it also allows other Google
  # services (and anything fronted by the same IPs). Enable it knowingly.
  [google]="generativelanguage.googleapis.com"     # Gemini API (free tier)
  [groq]="api.groq.com"                            # free tier
  [cerebras]="api.cerebras.ai"                     # free tier
  [mistral]="api.mistral.ai"
  [deepseek]="api.deepseek.com"
  [xai]="api.x.ai"
  [together]="api.together.xyz"
  [zai]="api.z.ai"
  [github-models]="models.github.ai"
  [github-copilot]="github.com api.github.com api.githubcopilot.com"


)
# Always allowed: opencode's model catalogue + npm
BASE_DOMAINS="models.dev registry.npmjs.org"

PROVIDERS="anthropic"; EXTRA_DOMAINS=""; ALLOW_GITHUB=0
[ -f /etc/firewall.conf ] && . /etc/firewall.conf

ALLOWED_DOMAINS=($BASE_DOMAINS)
for p in ${PROVIDERS//,/ }; do
  [ -n "${PROVIDER_DOMAINS[$p]:-}" ] || { echo "ERROR: unknown provider '$p'"; exit 1; }
  ALLOWED_DOMAINS+=(${PROVIDER_DOMAINS[$p]})
done
ALLOWED_DOMAINS+=($EXTRA_DOMAINS)

# ---- step 1: base rules ----------------------------------------------------
# Save Docker's embedded-DNS NAT rules BEFORE flushing (needed on user-defined networks)
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

iptables -F; iptables -X
iptables -t nat -F; iptables -t nat -X
iptables -t mangle -F; iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

if [ -n "$DOCKER_DNS_RULES" ]; then
  iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
  iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
  echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
fi

# DNS: only to the container's resolver(s)
for ns in $(awk '/^nameserver/ {print $2}' /etc/resolv.conf | grep -E '^[0-9.]+$'); do
  iptables -A OUTPUT -p udp -d "$ns" --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp -d "$ns" --dport 53 -j ACCEPT
  iptables -A INPUT  -p udp -s "$ns" --sport 53 -j ACCEPT
  iptables -A INPUT  -p tcp -s "$ns" --sport 53 -j ACCEPT
done
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# CHANGED: these rules now go in BEFORE the ipset is populated. With egress already
# closed, the GitHub-meta curl below could never connect otherwise.
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
ipset create allowed-domains hash:net
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited   # fast failure instead of hangs

# ---- step 2: fill the allowlist --------------------------------------------
# Resolve several times: round-robin/CDN domains return different IPs per query
resolve_into_ipset() {
  local domain=$1 found=0 ip
  echo "Resolving $domain..."
  for _ in 1 2 3 4; do
    for ip in $(dig +short A "$domain" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true); do
      ipset add -exist allowed-domains "$ip"; found=1
    done
    sleep 0.5
  done
  [ "$found" = 1 ] || { echo "ERROR: could not resolve $domain"; exit 1; }
}

if [ "$ALLOW_GITHUB" = "1" ]; then
  # CHANGED: allow api.github.com first so the meta request can actually go out.
  resolve_into_ipset api.github.com
  echo "Fetching GitHub IP ranges..."
  gh_ranges=$(curl -fsS --max-time 15 https://api.github.com/meta)
  echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null
  while read -r cidr; do
    [[ "$cidr" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]] || continue
    ipset add -exist allowed-domains "$cidr"
  done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | sort -u)
fi

for domain in $(printf '%s\n' "${ALLOWED_DOMAINS[@]}" | sort -u); do
  resolve_into_ipset "$domain"
done

# ---- step 3: verify --------------------------------------------------------
# CHANGED: test against a bare IP instead of example.com. example.com can share a CDN
# IP with an allowed domain, which made the old check fail even when the firewall worked.
echo "Verifying firewall..."
if curl --connect-timeout 5 -s -o /dev/null https://9.9.9.9; then
  echo "ERROR: 9.9.9.9 reachable, firewall failed"; exit 1
fi
curl --connect-timeout 8 -s -o /dev/null https://models.dev \
  || { echo "ERROR: models.dev not reachable"; exit 1; }
echo "Firewall active. Providers: $PROVIDERS. Allowed: $(printf '%s ' "${ALLOWED_DOMAINS[@]}")"