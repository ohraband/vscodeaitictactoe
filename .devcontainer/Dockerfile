# CHANGED: Node 22 -> 24 (Node 22 is maintenance-only and EOL on 30 Apr 2027).
# CHANGED (optional hardening): pin the base image by digest once you've picked one:
#   docker pull node:24-bookworm && docker inspect --format "{{index .RepoDigests 0}}" node:24-bookworm
# then use: FROM node:24-bookworm@sha256:<digest>
FROM node:24-bookworm

ARG TZ=Europe/Prague
ENV TZ=$TZ DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq less procps ripgrep fzf \
      iptables ipset iproute2 dnsutils sudo zsh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Persisted dirs (mounted as volumes in devcontainer.json)
RUN mkdir -p /commandhistory /home/node/.config/opencode /home/node/.local/share/opencode /workspace \
 && touch /commandhistory/.bash_history \
 && chown -R node:node /commandhistory /home/node /workspace




# CHANGED: "latest" is resolved to an exact version at build time, installed, and recorded
# in /etc/opencode-version. The image then stays on that version (autoupdate is off, and
# Docker caches this layer) until you deliberately rebuild without cache to update.
# To force a specific version instead, set OPENCODE_VERSION in devcontainer.json.
ARG OPENCODE_VERSION=latest
RUN v="$(npm view "opencode-ai@${OPENCODE_VERSION}" version | tail -n1)" \
 && echo "Installing opencode-ai@${v}" \
 && npm install -g "opencode-ai@${v}" \
 && echo "${v}" > /etc/opencode-version



# Firewall options are baked in root-owned, so the agent cannot widen them
ARG PROVIDERS=anthropic
ARG EXTRA_DOMAINS=""
ARG ALLOW_GITHUB=0
RUN printf 'PROVIDERS="%s"\nEXTRA_DOMAINS="%s"\nALLOW_GITHUB=%s\n' \
      "${PROVIDERS}" "${EXTRA_DOMAINS}" "${ALLOW_GITHUB}" > /etc/firewall.conf \
 && chmod 644 /etc/firewall.conf




# Firewall script: the ONLY thing node may run as root
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN sed -i 's/\r$//' /usr/local/bin/init-firewall.sh \
 && chmod 755 /usr/local/bin/init-firewall.sh \
 && chown root:root /usr/local/bin/init-firewall.sh \
 && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
 && chmod 0440 /etc/sudoers.d/node-firewall


USER node
WORKDIR /workspace
ENV SHELL=/bin/zsh HISTFILE=/commandhistory/.bash_history