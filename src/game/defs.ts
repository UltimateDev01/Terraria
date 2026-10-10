/* ============================================================
   TERRAFORGE — core data definitions: tiles, items, recipes
   ============================================================ */

export const TILE = 16; // world pixels per tile

/* ---------- tile ids ---------- */
export const T = {
  AIR: 0,
  DIRT: 1,
  GRASS: 2,
  STONE: 3,
  WOOD: 4, // planks
  TRUNK: 5,
  LEAF: 6,
  SAND: 7,
  SNOW: 8,
  ICE: 9,
  MUD: 10,
  JLEAF: 11,
  ASH: 12,
  OBSIDIAN: 13,
  TORCH: 14,
  CHEST: 15,
  WORKBENCH: 16,
  FURNACE: 17,
  ANVIL: 18,
  COAL: 19,
  COPPER: 20,
  IRON: 21,
  SILVER: 22,
  GOLD: 23,
  CRYSTAL: 24,
  RUBY: 25,
  AMBER: 26,
  GLOWSHROOM: 27,
  LAVA: 28,
  WATER: 29,
  SEAL: 30,
  CLAY: 31,
  GRAVEL: 32,
  BRICK: 33,
  GLASS: 34,
} as const;

export type TileId = number;

export const TILE_COUNT = 35;

/* tool kinds */
export const TOOL_NONE = 0;
export const TOOL_PICK = 1;
export const TOOL_AXE = 2;

export interface TileTable {
  name: string[];
  solid: Uint8Array;
  opaque: Uint8Array; // blocks light/sky
  hp: Float32Array; // base frames of mining power-1 work
  tool: Uint8Array;
  minPower: Uint8Array;
  light: Uint8Array; // emitted light 0..255
  liquid: Uint8Array;
  drop: string[]; // item id
  dropCount: Uint8Array;
  friction: Float32Array;
  damage: Float32Array; // contact damage (lava)
  fill: Uint8Array; // replaces with dirt when broken
}

function buildTiles() {
  const N = TILE_COUNT;
  const name = new Array(N).fill("");
  const solid = new Uint8Array(N);
  const opaque = new Uint8Array(N);
  const hp = new Float32Array(N);
  const tool = new Uint8Array(N);
  const minPower = new Uint8Array(N);
  const light = new Uint8Array(N);
  const liquid = new Uint8Array(N);
  const drop = new Array(N).fill("") as string[];
  const dropCount = new Uint8Array(N);
  const friction = new Float32Array(N);
  const damage = new Float32Array(N);
  const fill = new Uint8Array(N);

  const def = (
    id: number,
    n: string,
    o: Partial<{
      solid: number; opaque: number; hp: number; tool: number; minPower: number;
      light: number; liquid: number; drop: string; n: number; friction: number;
      damage: number; fill: number;
    }> = {}
  ) => {
    name[id] = n;
    solid[id] = o.solid ?? 0;
    opaque[id] = o.opaque ?? 0;
    hp[id] = o.hp ?? 10;
    tool[id] = o.tool ?? TOOL_PICK;
    minPower[id] = o.minPower ?? 1;
    light[id] = o.light ?? 0;
    liquid[id] = o.liquid ?? 0;
    drop[id] = o.drop ?? (n.toLowerCase().replace(/ /g, "_"));
    dropCount[id] = o.n ?? 1;
    friction[id] = o.friction ?? 0;
    damage[id] = o.damage ?? 0;
    fill[id] = o.fill ?? 0;
  };

  def(T.AIR, "Air", { hp: 0 });
  def(T.DIRT, "Dirt", { solid: 1, opaque: 1, hp: 9, drop: "dirt", friction: 0.86 });
  def(T.GRASS, "Grass Block", { solid: 1, opaque: 1, hp: 11, drop: "dirt", friction: 0.9 });
  def(T.STONE, "Stone", { solid: 1, opaque: 1, hp: 26, friction: 0.86 });
  def(T.WOOD, "Wood", { solid: 1, opaque: 1, hp: 16, tool: TOOL_AXE, drop: "wood", friction: 0.8 });
  def(T.TRUNK, "Tree Trunk", { solid: 1, opaque: 1, hp: 14, tool: TOOL_AXE, drop: "wood", n: 2, friction: 0.8 });
  def(T.LEAF, "Leaves", { hp: 4, tool: TOOL_AXE, drop: "wood" });
  def(T.SAND, "Sand", { solid: 1, opaque: 1, hp: 8, friction: 0.72 });
  def(T.SNOW, "Snow Block", { solid: 1, opaque: 1, hp: 7, friction: 0.66 });
  def(T.ICE, "Ice", { solid: 1, opaque: 1, hp: 22, friction: 0.28 });
  def(T.MUD, "Mud", { solid: 1, opaque: 1, hp: 9, friction: 0.8 });
  def(T.JLEAF, "Jungle Leaves", { hp: 4, tool: TOOL_AXE, drop: "wood" });
  def(T.ASH, "Ash Block", { solid: 1, opaque: 1, hp: 14, friction: 0.86 });
  def(T.OBSIDIAN, "Obsidian", { solid: 1, opaque: 1, hp: 80, minPower: 5 });
  def(T.TORCH, "Torch", { light: 175, hp: 1, tool: TOOL_NONE, drop: "torch" });
  def(T.CHEST, "Chest", { solid: 1, opaque: 1, hp: 14, tool: TOOL_AXE, drop: "chest" });
  def(T.WORKBENCH, "Work Bench", { solid: 1, hp: 12, tool: TOOL_AXE, drop: "workbench" });
  def(T.FURNACE, "Furnace", { solid: 1, opaque: 1, hp: 18, drop: "furnace", light: 90 });
  def(T.ANVIL, "Iron Anvil", { solid: 1, opaque: 1, hp: 24, drop: "anvil" });
  def(T.COAL, "Coal Ore", { solid: 1, opaque: 1, hp: 28, drop: "coal" });
  def(T.COPPER, "Copper Ore", { solid: 1, opaque: 1, hp: 30, drop: "copper_ore" });
  def(T.IRON, "Iron Ore", { solid: 1, opaque: 1, hp: 34, drop: "iron_ore" });
  def(T.SILVER, "Silver Ore", { solid: 1, opaque: 1, hp: 40, minPower: 2, drop: "silver_ore" });
  def(T.GOLD, "Gold Ore", { solid: 1, opaque: 1, hp: 46, minPower: 3, drop: "gold_ore" });
  def(T.CRYSTAL, "Crystal", { solid: 1, opaque: 1, hp: 52, minPower: 4, light: 60, drop: "crystal" });
  def(T.RUBY, "Ruby", { solid: 1, opaque: 1, hp: 56, minPower: 4, light: 40, drop: "ruby" });
  def(T.AMBER, "Amber", { solid: 1, opaque: 1, hp: 54, minPower: 3, light: 50, drop: "amber" });
  def(T.GLOWSHROOM, "Glowshroom", { hp: 3, tool: TOOL_NONE, light: 110, drop: "glowshroom" });
  def(T.LAVA, "Lava", { liquid: 1, opaque: 1, hp: 0, light: 210, damage: 44, drop: "" });
  def(T.WATER, "Water", { liquid: 1, hp: 0, drop: "" });
  def(T.SEAL, "Ancient Seal", { solid: 1, opaque: 1, hp: 96, minPower: 4, light: 120, drop: "ancient_core" });
  def(T.CLAY, "Clay", { solid: 1, opaque: 1, hp: 12, drop: "clay" });
  def(T.GRAVEL, "Gravel", { solid: 1, opaque: 1, hp: 10, drop: "gravel" });
  def(T.BRICK, "Stone Bricks", { solid: 1, opaque: 1, hp: 30, drop: "brick" });
  def(T.GLASS, "Crystal Glass", { solid: 1, hp: 6, tool: TOOL_NONE, drop: "glass_crystal" });

  // lava/water can't be mined -> handled by bucket-less logic
  return {
    name, solid, opaque, hp, tool, minPower, light, liquid, drop, dropCount, friction, damage, fill,
  };
}

export const TL = buildTiles();

export const isSolidAt = (t: number) => TL.solid[t] === 1;
export const isLiquid = (t: number) => TL.liquid[t] === 1;

/* ---------- walls (background) ---------- */
export const W = { NONE: 0, DIRT: 1, STONE: 2, WOOD: 3, BRICK: 4 } as const;
export const WALL_NAMES = ["", "Dirt Wall", "Stone Wall", "Wood Wall", "Stone Wall"];
export const WALL_SOLID = 0; // walls never block movement
export const WALL_BLOCKS_SKY = [0, 1, 1, 1, 1];

/* ============================================================
   ITEMS
   ============================================================ */
export type ItemKind =
  | "block" | "material" | "tool" | "sword" | "bow" | "magic"
  | "ammo" | "armor" | "accessory" | "consumable" | "ore";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  stack: number;
  tile?: number;
  desc?: string;
  /* tools */
  pick?: number;   // pickaxe power tier (mines tiles with minPower <= pick)
  pickSpeed?: number; // multiplier on mining speed
  axe?: number;
  /* weapons */
  damage?: number;
  speed?: number;  // use cooldown in frames
  reach?: number;  // melee reach in px
  kb?: number;     // knockback
  crit?: number;   // 0..1
  /* ammo */
  ammo?: "arrow";
  /* casting */
  mana?: number;
  projectile?: string;
  /* armor */
  defense?: number;
  equipSlot?: "helm" | "chest" | "legs";
  /* accessory */
  acc?: string;
  /* consumable */
  heal?: number;
  give?: number; // mana restore
  /* misc */
  rare?: number; // 0..6 color
  value?: number;
  swing?: number; // arc
  light?: number;
}

const items: Record<string, ItemDef> = {};
const I = (d: ItemDef) => { items[d.id] = d; return d; };

/* --- placeable blocks --- */
const blk = (id: string, tile: number, name: string, rare = 0) =>
  I({ id, name, kind: "block", stack: 999, tile, rare, desc: "Place in the world" });

blk("dirt", T.DIRT, "Dirt");
blk("stone", T.STONE, "Stone");
blk("wood", T.WOOD, "Wood");
blk("sand", T.SAND, "Sand");
blk("snow", T.SNOW, "Snow Block");
blk("ice", T.ICE, "Ice");
blk("mud", T.MUD, "Mud");
blk("ash", T.ASH, "Ash Block");
blk("obsidian", T.OBSIDIAN, "Obsidian", 2);
blk("clay", T.CLAY, "Clay");
blk("gravel", T.GRAVEL, "Gravel");
blk("brick", T.BRICK, "Stone Bricks");
blk("torch", T.TORCH, "Torch", 1, );
items["torch"].desc = "Lights up the dark. Placeable anywhere.";
blk("chest", T.CHEST, "Chest", 1);
items["chest"].desc = "Stores items. Right-click to open.";
blk("workbench", T.WORKBENCH, "Work Bench", 1);
items["workbench"].desc = "Crafting station: basic gear";
blk("furnace", T.FURNACE, "Furnace", 1);
items["furnace"].desc = "Crafting station: smelt ores";
blk("anvil", T.ANVIL, "Iron Anvil", 2);
items["anvil"].desc = "Crafting station: weapons & armor";
blk("glowshroom", T.GLOWSHROOM, "Glowshroom", 2);
blk("crystal", T.CRYSTAL, "Crystal", 3);
blk("ruby", T.RUBY, "Ruby", 3);
blk("amber", T.AMBER, "Amber", 3);

/* --- ores & materials --- */
const mat = (id: string, name: string, rare = 0, stack = 999, desc?: string) =>
  I({ id, name, kind: "material", stack, rare, desc });

mat("coal", "Coal", 1, 999, "Fuel for furnaces & torches");
mat("copper_ore", "Raw Copper", 0);
mat("iron_ore", "Raw Iron", 1);
mat("silver_ore", "Raw Silver", 2);
mat("gold_ore", "Raw Gold", 2);
mat("copper_bar", "Copper Bar", 1);
mat("iron_bar", "Iron Bar", 1);
mat("silver_bar", "Silver Bar", 2);
mat("gold_bar", "Gold Bar", 2);
mat("gel", "Gel", 0, 999, "Sticky residue dropped by slimes");
mat("bone", "Bone", 0, 999, "Skeleton remains");
mat("silk", "Silk Strand", 1, 999, "Woven from cave cobwebs");
mat("ember_core", "Ember Core", 3, 999, "Warm to the touch");
mat("frost_shard", "Frost Shard", 3, 999, "Cold to the touch");
mat("ancient_core", "Ancient Core", 5, 20, "Pulses with a slow heartbeat");
mat("coin", "Ancient Coin", 2, 999, "Buried treasure");
items["coin"].kind = "material";
items["coin"].value = 1;

/* --- tools --- */
const pick = (id: string, name: string, power: number, spd: number, rare: number) =>
  I({ id, name, kind: "tool", stack: 1, pick: power, pickSpeed: spd, desc: `Mining power ${power}`, rare });
pick("hand", "Bare Hand", 1, 0.45, 0);
pick("copper_pickaxe", "Copper Pickaxe", 2, 1, 1);
pick("iron_pickaxe", "Iron Pickaxe", 3, 1.35, 1);
pick("silver_pickaxe", "Silver Pickaxe", 4, 1.7, 2);
pick("crystal_pickaxe", "Crystal Pickaxe", 5, 2.1, 3);
pick("molten_pickaxe", "Molten Pickaxe", 6, 2.6, 4);

const axe = (id: string, name: string, power: number, rare: number) =>
  I({ id, name, kind: "tool", stack: 1, axe: power, pick: 0, pickSpeed: 0.4, desc: `Chopping power ${power}`, rare });
axe("copper_axe", "Copper Axe", 2, 1);
axe("iron_axe", "Iron Axe", 3, 1);
axe("silver_axe", "Silver Axe", 4, 2);

/* --- swords --- */
const sword = (id: string, name: string, dmg: number, spd: number, reach: number, kb: number, rare: number, swing: number) =>
  I({ id, name, kind: "sword", stack: 1, damage: dmg, speed: spd, reach, kb, swing, rare, desc: `${dmg} melee damage` });
sword("copper_shortsword", "Copper Shortsword", 11, 22, 34, 4, 1, 1.6);
sword("iron_broadsword", "Iron Broadsword", 17, 26, 42, 5.5, 1, 1.9);
sword("silver_saber", "Silver Saber", 23, 17, 40, 4, 2, 1.5);
sword("gold_flamberge", "Gold Flamberge", 29, 24, 48, 6.5, 2, 2.1);
sword("molten_blade", "Molten Blade", 38, 20, 50, 7, 4, 2.0);
sword("ancient_reaver", "Ancient Reaver", 52, 18, 62, 9, 5, 2.4);
items["molten_blade"].light = 90;
items["ancient_reaver"].light = 110;

/* --- bows / ammo / magic --- */
const bow = (id: string, name: string, dmg: number, spd: number, rare: number) =>
  I({ id, name, kind: "bow", stack: 1, damage: dmg, speed: spd, ammo: "arrow", rare, desc: `${dmg} base ranged damage` });
bow("wooden_bow", "Wooden Bow", 6, 30, 0);
bow("iron_bow", "Iron Bow", 12, 25, 1);
bow("crystal_bow", "Crystal Bow", 19, 19, 3);

const arrow = (id: string, name: string, dmg: number, rare: number, kind: "ammo" | "magic" = "ammo") =>
  I({ id, name, kind, stack: 999, damage: dmg, ammo: kind === "ammo" ? "arrow" : undefined, rare, desc: `${dmg} damage` });
arrow("wooden_arrow", "Wooden Arrow", 4, 0);
arrow("flaming_arrow", "Flaming Arrow", 9, 2);
arrow("frost_arrow", "Frost Arrow", 13, 3);

const wand = (id: string, name: string, dmg: number, mana: number, spd: number, projectile: string, rare: number) =>
  I({ id, name, kind: "magic", stack: 1, damage: dmg, mana, speed: spd, projectile, rare, desc: `${dmg} magic damage · ${mana} mana` });
wand("ember_wand", "Ember Wand", 16, 10, 24, "ember", 2);
wand("frost_wand", "Frost Wand", 22, 14, 26, "frost", 3);
wand("crystal_staff", "Crystal Staff", 34, 20, 30, "crystal", 4);

/* --- armor --- */
const arm = (id: string, name: string, slot: "helm" | "chest" | "legs", def: number, rare: number) =>
  I({ id, name, kind: "armor", stack: 1, defense: def, equipSlot: slot, rare, desc: `${def} defense` });
arm("copper_helmet", "Copper Helmet", "helm", 2, 1);
arm("copper_chest", "Copper Chestplate", "chest", 3, 1);
arm("copper_greaves", "Copper Greaves", "legs", 2, 1);
arm("iron_helmet", "Iron Helmet", "helm", 3, 1);
arm("iron_chest", "Iron Chestplate", "chest", 5, 1);
arm("iron_greaves", "Iron Greaves", "legs", 3, 1);
arm("silver_helmet", "Silver Helmet", "helm", 4, 2);
arm("silver_chest", "Silver Chestplate", "chest", 6, 2);
arm("silver_greaves", "Silver Greaves", "legs", 5, 2);
arm("gold_helmet", "Gold Helmet", "helm", 6, 2);
arm("gold_chest", "Gold Chestplate", "chest", 8, 2);
arm("gold_greaves", "Gold Greaves", "legs", 6, 2);
arm("obsidian_helmet", "Obsidian Helm", "helm", 8, 4);
arm("obsidian_chest", "Obsidian Chestplate", "chest", 11, 4);
arm("obsidian_greaves", "Obsidian Greaves", "legs", 8, 4);

/* --- accessories --- */
const acc = (id: string, name: string, effect: string, rare: number, desc: string) =>
  I({ id, name, kind: "accessory", stack: 1, acc: effect, rare, desc });
acc("swift_boots", "Swift Boots", "speed", 2, "+35% movement speed");
acc("regen_band", "Band of Regrowth", "regen", 2, "Regenerates health over time");
acc("lucky_coin", "Lucky Coin", "crit", 3, "+10% critical strike chance");
acc("warrior_emblem", "Warrior Emblem", "melee", 3, "+15% melee damage");
acc("ranger_emblem", "Ranger Emblem", "ranged", 3, "+15% ranged damage");
acc("feather_wings", "Feathered Wings", "wings", 4, "Double jump & glide");
acc("lava_ward", "Ward of Cinders", "fireproof", 4, "Immunity to lava & burns");
acc("golem_heart", "Golem Heart", "heart", 5, "+40 max health, +8 defense, regen");

/* --- consumables --- */
I({ id: "healing_potion", name: "Healing Potion", kind: "consumable", stack: 30, heal: 70, speed: 42, rare: 1, desc: "Restores 70 health" });
I({ id: "mana_potion", name: "Mana Potion", kind: "consumable", stack: 30, give: 60, speed: 42, rare: 1, desc: "Restores 60 mana" });
I({ id: "apple", name: "Glow Apple", kind: "consumable", stack: 20, heal: 25, give: 25, speed: 30, rare: 3, desc: "Restores 25 health & mana" });

export const ITEMS = items;
export const ITEM_IDS = Object.keys(items);

export const RARITY_COLORS = [
  "#9fb2c8", "#cfe3f2", "#8fe0a8", "#7fd3ff", "#e6b8ff", "#ffd166", "#ff8f6b",
];
export const RARITY_NAMES = ["Common", "Uncommon", "Rare", "Fine", "Excellent", "Radiant", "Mythic"];

/* ============================================================
   RECIPES
   ============================================================ */
export type Station = "hand" | "workbench" | "furnace" | "anvil";
export const STATION_NAMES: Record<Station, string> = {
  hand: "Crafting Bench", workbench: "Work Bench", furnace: "Furnace", anvil: "Iron Anvil",
};

export interface Recipe {
  out: string;
  count: number;
  need: [string, number][];
  at: Station;
}

export const RECIPES: Recipe[] = [];

const R = (out: string, count: number, need: [string, number][], at: Station = "hand") =>
  RECIPES.push({ out, count, need, at });

R("workbench", 1, [["wood", 10]]);
R("torch", 4, [["wood", 1], ["coal", 1]]);
R("wood", 4, [["stone", 1], ["gel", 1]]); // salvage
R("stone", 2, [["coal", 1], ["clay", 1]]); // pressed stone
R("wooden_bow", 1, [["wood", 12], ["silk", 3]]);
R("wooden_arrow", 12, [["wood", 3], ["stone", 3]]);
R("healing_potion", 1, [["gel", 5], ["glowshroom", 2]]);
R("mana_potion", 1, [["gel", 4], ["crystal", 1]]);
R("chest", 1, [["wood", 24], ["iron_bar", 2]]);
// workbench
R("furnace", 1, [["stone", 24], ["wood", 6], ["coal", 6]], "workbench");
R("copper_pickaxe", 1, [["copper_bar", 12], ["wood", 6]], "workbench");
R("copper_axe", 1, [["copper_bar", 9], ["wood", 5]], "workbench");
R("copper_shortsword", 1, [["copper_bar", 10], ["wood", 4]], "workbench");
R("swift_boots", 1, [["iron_bar", 6], ["gel", 5]], "workbench");
R("regen_band", 1, [["iron_bar", 8], ["glowshroom", 4]], "workbench");
R("feather_wings", 1, [["gold_bar", 10], ["silk", 12], ["crystal", 3]], "workbench");
R("apple", 2, [["glowshroom", 3], ["amber", 1]], "workbench");
// furnace
R("copper_bar", 1, [["copper_ore", 3]], "furnace");
R("iron_bar", 1, [["iron_ore", 3], ["coal", 1]], "furnace");
R("silver_bar", 1, [["silver_ore", 3], ["coal", 1]], "furnace");
R("gold_bar", 1, [["gold_ore", 4], ["coal", 1]], "furnace");
R("brick", 4, [["clay", 3], ["sand", 2]], "furnace");
R("glass_crystal", 1, [["sand", 4], ["coal", 1]], "furnace");
R("obsidian", 2, [["stone", 2], ["ember_core", 1]], "furnace");
R("ice", 2, [["snow", 2], ["frost_shard", 1]], "furnace");
R("flaming_arrow", 10, [["wooden_arrow", 10], ["ember_core", 1]], "furnace");
R("frost_arrow", 10, [["wooden_arrow", 10], ["frost_shard", 1]], "furnace");
R("ember_wand", 1, [["copper_bar", 12], ["ember_core", 3], ["crystal", 2]], "furnace");
R("frost_wand", 1, [["silver_bar", 12], ["frost_shard", 4], ["crystal", 2]], "furnace");
// anvil
R("iron_pickaxe", 1, [["iron_bar", 14], ["wood", 8]], "anvil");
R("iron_axe", 1, [["iron_bar", 10], ["wood", 6]], "anvil");
R("silver_pickaxe", 1, [["silver_bar", 16], ["wood", 8]], "anvil");
R("crystal_pickaxe", 1, [["crystal", 12], ["silver_bar", 12], ["wood", 8]], "anvil");
R("molten_pickaxe", 1, [["obsidian", 20], ["ember_core", 8], ["gold_bar", 8]], "anvil");
R("iron_broadsword", 1, [["iron_bar", 14], ["gel", 3]], "anvil");
R("silver_saber", 1, [["silver_bar", 16], ["silk", 4]], "anvil");
R("gold_flamberge", 1, [["gold_bar", 20], ["ember_core", 4]], "anvil");
R("molten_blade", 1, [["obsidian", 18], ["ember_core", 10], ["gold_bar", 6]], "anvil");
R("ancient_reaver", 1, [["ancient_core", 3], ["obsidian", 20], ["gold_bar", 12]], "anvil");
R("iron_bow", 1, [["iron_bar", 12], ["silk", 5]], "anvil");
R("crystal_bow", 1, [["crystal", 10], ["silver_bar", 10], ["silk", 6]], "anvil");
R("crystal_staff", 1, [["crystal", 14], ["gold_bar", 8], ["ruby", 3]], "anvil");
R("anvil", 1, [["iron_bar", 12], ["stone", 16]], "workbench");
// armor sets
const set = (tag: string, bar: string, h: number, c: number, g: number, def: number) => {
  R(`${tag}_helmet`, 1, [[bar, h]], "anvil");
  R(`${tag}_chest`, 1, [[bar, c]], "anvil");
  R(`${tag}_greaves`, 1, [[bar, g]], "anvil");
  if (def) items[`${tag}_helmet`].defense = def;
};
set("copper", "copper_bar", 6, 9, 7, 2);
set("iron", "iron_bar", 8, 12, 9, 3);
set("silver", "silver_bar", 10, 14, 11, 4);
set("gold", "gold_bar", 12, 16, 13, 6);
set("obsidian", "obsidian", 14, 20, 16, 8);
R("warrior_emblem", 1, [["gold_bar", 8], ["bone", 10], ["ruby", 2]], "anvil");
R("ranger_emblem", 1, [["gold_bar", 8], ["silk", 12], ["crystal", 2]], "anvil");
R("lucky_coin", 1, [["gold_bar", 12], ["amber", 4]], "anvil");
R("lava_ward", 1, [["ember_core", 12], ["obsidian", 10], ["gold_bar", 4]], "anvil");
R("golem_heart", 1, [["ancient_core", 4], ["gold_bar", 12], ["crystal", 8]], "anvil");

// fix armor defense values to sensible per-piece numbers
Object.assign(items["copper_helmet"], { defense: 2 });
Object.assign(items["copper_chest"], { defense: 3 });
Object.assign(items["copper_greaves"], { defense: 2 });
Object.assign(items["iron_helmet"], { defense: 3 });
Object.assign(items["iron_chest"], { defense: 5 });
Object.assign(items["iron_greaves"], { defense: 3 });
Object.assign(items["silver_helmet"], { defense: 4 });
Object.assign(items["silver_chest"], { defense: 6 });
Object.assign(items["silver_greaves"], { defense: 5 });
Object.assign(items["gold_helmet"], { defense: 5 });
Object.assign(items["gold_chest"], { defense: 8 });
Object.assign(items["gold_greaves"], { defense: 6 });
Object.assign(items["obsidian_helmet"], { defense: 8 });
Object.assign(items["obsidian_chest"], { defense: 11 });
Object.assign(items["obsidian_greaves"], { defense: 8 });

// glass is a decorative block
I({ id: "glass_crystal", name: "Crystal Glass", kind: "block", stack: 999, tile: T.GLASS, rare: 2, desc: "Transparent building block" });

export function itemDef(id: string): ItemDef {
  return items[id] || items["dirt"];
}
export function itemName(id: string): string {
  return items[id]?.name ?? "Unknown";
}
export function tileItem(tile: number): string | null {
  const d = TL.drop[tile];
  return d && items[d] ? d : null;
}

/* ---------- enemy -> loot tables ---------- */
export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  def: number;
  w: number;
  h: number;
  speed: number;
  ai: "hop" | "walk" | "fly" | "shooter" | "hover_shooter" | "boss";
  drops: [string, number, number][]; // item, min, max (chance 0..1 in max slot when min<1)
  coins: [number, number];
  color: string;
  glow?: string;
  kbResist?: number;
  fleeDay?: number; // burns in daylight
  ranged?: { speed: number; dmg: number; cd: number; proj: string };
  boss?: boolean;
  spawnLayers: number[]; // 0 surface, 1 cave, 2 deep
  biomes?: number[]; // 0 any
  xp?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {};
const E = (d: EnemyDef) => { ENEMIES[d.id] = d; };

E({
  id: "slime_blue", name: "Verdant Slime", hp: 28, dmg: 8, def: 2, w: 24, h: 18, speed: 1.5,
  ai: "hop", drops: [["gel", 2, 1]], coins: [2, 12], color: "#5fc9a6", glow: "#a8ffe4",
  spawnLayers: [0], xp: 4,
});
E({
  id: "slime_gold", name: "Gilded Slime", hp: 44, dmg: 12, def: 4, w: 28, h: 20, speed: 1.7,
  ai: "hop", drops: [["gel", 3, 1], ["coin", 20, 0.6]], coins: [20, 70], color: "#e8c04a", glow: "#fff0a8",
  spawnLayers: [0, 1], xp: 7,
});
E({
  id: "zombie", name: "Gravel Shambler", hp: 62, dmg: 15, def: 5, w: 18, h: 40, speed: 1.15,
  ai: "walk", drops: [["bone", 2, 1], ["dirt", 3, 0.4]], coins: [5, 25], color: "#7d9a6a", glow: "#c8ffb0",
  fleeDay: 1, spawnLayers: [0], xp: 9, kbResist: 0.5,
});
E({
  id: "bat", name: "Cave Bat", hp: 32, dmg: 10, def: 1, w: 18, h: 14, speed: 2.6,
  ai: "fly", drops: [["silk", 2, 1]], coins: [0, 8], color: "#6b5b8c", glow: "#c8a8ff",
  spawnLayers: [1], xp: 6,
});
E({
  id: "skeleton", name: "Bone Archer", hp: 58, dmg: 13, def: 4, w: 18, h: 38, speed: 1.0,
  ai: "shooter", drops: [["bone", 4, 1], ["wooden_arrow", 8, 0.5]], coins: [8, 40], color: "#dfe4ea", glow: "#ffffff",
  spawnLayers: [1], ranged: { speed: 6.2, dmg: 11, cd: 70, proj: "bone_arrow" }, xp: 12,
});
E({
  id: "crawler", name: "Cave Crawler", hp: 48, dmg: 14, def: 3, w: 22, h: 16, speed: 2.2,
  ai: "walk", drops: [["silk", 3, 1], ["gel", 1, 0.6]], coins: [4, 20], color: "#4a3c63", glow: "#b48cff",
  spawnLayers: [1], xp: 10,
});
E({
  id: "stinger", name: "Jungle Stinger", hp: 42, dmg: 16, def: 2, w: 20, h: 18, speed: 3.0,
  ai: "hover_shooter", drops: [["silk", 3, 1], ["amber", 1, 0.25]], coins: [6, 30], color: "#b6e04a", glow: "#eaff8a",
  spawnLayers: [0, 1], biomes: [2], ranged: { speed: 5.4, dmg: 13, cd: 90, proj: "stinger_dart" }, xp: 14,
});
E({
  id: "frost_golem", name: "Frost Golem", hp: 120, dmg: 24, def: 12, w: 26, h: 40, speed: 0.9,
  ai: "shooter", drops: [["frost_shard", 3, 1], ["ice", 6, 0.5]], coins: [30, 90], color: "#93c9e8", glow: "#d8f4ff",
  spawnLayers: [1, 2], biomes: [3], ranged: { speed: 5.0, dmg: 20, cd: 80, proj: "icicle" }, kbResist: 0.8, xp: 26,
});
E({
  id: "ice_bat", name: "Rime Bat", hp: 46, dmg: 15, def: 3, w: 18, h: 14, speed: 3.1,
  ai: "fly", drops: [["frost_shard", 1, 0.6], ["silk", 1, 0.5]], coins: [0, 15], color: "#79b7d8", glow: "#bff0ff",
  spawnLayers: [1], biomes: [3], xp: 11,
});
E({
  id: "magma_slime", name: "Magma Slime", hp: 110, dmg: 28, def: 10, w: 26, h: 20, speed: 1.9,
  ai: "hop", drops: [["ember_core", 2, 1], ["obsidian", 4, 0.4]], coins: [25, 80], color: "#ff6b35", glow: "#ffd08a",
  spawnLayers: [2], biomes: [4], kbResist: 0.4, xp: 24,
});
E({
  id: "fire_wraith", name: "Cinder Wraith", hp: 96, dmg: 30, def: 8, w: 22, h: 30, speed: 1.6,
  ai: "hover_shooter", drops: [["ember_core", 3, 1], ["ash", 8, 0.5]], coins: [30, 110], color: "#ff8a4c", glow: "#ffd28a",
  spawnLayers: [2], biomes: [4], ranged: { speed: 5.6, dmg: 24, cd: 60, proj: "fireball" }, xp: 28,
});
E({
  id: "stone_guardian", name: "Deep Guardian", hp: 180, dmg: 32, def: 16, w: 28, h: 42, speed: 1.0,
  ai: "shooter", drops: [["ancient_core", 1, 0.35], ["brick", 10, 0.6]], coins: [60, 180], color: "#8d8779", glow: "#ffd9a0",
  spawnLayers: [2], ranged: { speed: 5.2, dmg: 26, cd: 75, proj: "rock" }, kbResist: 0.9, xp: 40,
});
E({
  id: "golem_king", name: "The Mossborn King", hp: 1500, dmg: 42, def: 22, w: 52, h: 66, speed: 1.15,
  ai: "boss", drops: [["ancient_core", 3, 1], ["crystal", 12, 1], ["ruby", 8, 1]], coins: [400, 900],
  color: "#7ea86a", glow: "#c9ff9a", kbResist: 1, boss: true, spawnLayers: [1, 2], xp: 300,
});

export const ENEMY_LIST = Object.keys(ENEMIES);
