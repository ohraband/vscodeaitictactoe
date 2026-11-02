-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Symbol" AS ENUM ('X', 'O');

-- CreateEnum
CREATE TYPE "Winner" AS ENUM ('X', 'O', 'DRAW');

-- CreateEnum
CREATE TYPE "FinishReason" AS ENUM ('LINE', 'DRAW', 'TIMEOUT', 'FORFEIT', 'ABANDONED');

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(20) NOT NULL,
    "displayNameNormalized" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "mode" "GameMode" NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "GameStatus" NOT NULL DEFAULT 'WAITING',
    "difficulty" "Difficulty",
    "board" VARCHAR(9) NOT NULL DEFAULT '.........',
    "turn" "Symbol" NOT NULL DEFAULT 'X',
    "winner" "Winner",
    "finishReason" "FinishReason",
    "winningLine" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "playerXId" UUID NOT NULL,
    "playerOId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "turnDeadline" TIMESTAMP(3),
    "rematchRequestedByX" BOOLEAN NOT NULL DEFAULT false,
    "rematchRequestedByO" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Move" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "playerId" UUID,
    "moveNumber" INTEGER NOT NULL,
    "cell" INTEGER NOT NULL,
    "symbol" "Symbol" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsGameCompleted" (
    "gameId" UUID NOT NULL,
    "mode" "GameMode" NOT NULL,
    "winner" "Winner",
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsGameCompleted_pkey" PRIMARY KEY ("gameId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_displayNameNormalized_key" ON "Player"("displayNameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Game_code_key" ON "Game"("code");

-- CreateIndex
CREATE INDEX "Game_visibility_status_mode_createdAt_idx" ON "Game"("visibility", "status", "mode", "createdAt");

-- CreateIndex
CREATE INDEX "Game_status_turnDeadline_idx" ON "Game"("status", "turnDeadline");

-- CreateIndex
CREATE INDEX "Game_mode_status_finishedAt_idx" ON "Game"("mode", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "Game_playerXId_createdAt_idx" ON "Game"("playerXId", "createdAt");

-- CreateIndex
CREATE INDEX "Game_playerOId_createdAt_idx" ON "Game"("playerOId", "createdAt");

-- CreateIndex
CREATE INDEX "Move_playerId_idx" ON "Move"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Move_gameId_moveNumber_key" ON "Move"("gameId", "moveNumber");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_playerXId_fkey" FOREIGN KEY ("playerXId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_playerOId_fkey" FOREIGN KEY ("playerOId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Move" ADD CONSTRAINT "Move_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Move" ADD CONSTRAINT "Move_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

