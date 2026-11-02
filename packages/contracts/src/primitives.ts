import { DIFFICULTIES, PLAYER_SYMBOLS } from '@ttt/game-engine';
import { z } from 'zod';
import {
  FINISH_REASONS,
  GAME_MODES,
  GAME_STATUSES,
  VISIBILITIES,
  WINNER_VALUES,
} from './constants.js';

export const difficultySchema = z.enum(DIFFICULTIES);
export const symbolSchema = z.enum(PLAYER_SYMBOLS);
export const gameModeSchema = z.enum(GAME_MODES);
export const gameStatusSchema = z.enum(GAME_STATUSES);
export const visibilitySchema = z.enum(VISIBILITIES);
export const winnerSchema = z.enum(WINNER_VALUES);
export const finishReasonSchema = z.enum(FINISH_REASONS);

export const cellIndexSchema = z.number().int().min(0).max(8);
export const boardSchema = z.array(symbolSchema.nullable()).length(9);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export type Difficulty = z.infer<typeof difficultySchema>;
