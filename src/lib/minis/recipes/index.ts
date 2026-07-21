// Starter roster: 12 sample recipes, one per core class. Each is a plain
// .json file — exactly the artifact an AI recipe generator would emit — and
// every one is zod-validated at import time so a bad sample fails the build
// (and the test suite), not the viewer at runtime.
import { parseMiniRecipe, type MiniRecipe } from '../recipe.ts';
import humanFighter from './human-fighter.json';
import elfWizard from './elf-wizard.json';
import halflingRogue from './halfling-rogue.json';
import dwarfCleric from './dwarf-cleric.json';
import elfRanger from './elf-ranger.json';
import dragonbornPaladin from './dragonborn-paladin.json';
import halfOrcBarbarian from './half-orc-barbarian.json';
import humanDruid from './human-druid.json';
import gnomeBard from './gnome-bard.json';
import humanMonk from './human-monk.json';
import tieflingWarlock from './tiefling-warlock.json';
import humanSorcerer from './human-sorcerer.json';

/** Raw JSON, pre-validation — exposed for tests and the recipe editor. */
export const RAW_SAMPLE_RECIPES: unknown[] = [
  humanFighter, elfWizard, halflingRogue, dwarfCleric, elfRanger,
  dragonbornPaladin, halfOrcBarbarian, humanDruid, gnomeBard, humanMonk,
  tieflingWarlock, humanSorcerer,
];

export const SAMPLE_RECIPES: MiniRecipe[] = RAW_SAMPLE_RECIPES.map(parseMiniRecipe);
