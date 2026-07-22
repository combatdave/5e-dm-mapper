// Data for The Sunless Citadel, Fortress Level.
// hrefs: area number -> D&D Beyond anchor (42-56 are Grove Level, for later).
import mapImage from "./assets/fortress-level.jpg";
import basePins from "../../user_pins.json";

/* pins baked in at build time — replace user_pins.json with a fresh
   edit-mode export and rebuild to update them */
export const BASE_PINS: Record<string, number[][]> = basePins;

export const MODULE_URL = "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel";

export const HREFS: Record<string, string> = {
  "1": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#1Ledge",
  "2": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#2SwitchbackStairs",
  "3": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#3CrumbledCourtyard",
  "4": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#4TowerShell",
  "5": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#5SecretPocket",
  "6": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#6OldApproach",
  "7": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#7GalleryofForlornNotes",
  "8": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#8PressurePlate",
  "9": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#9DragonRiddle",
  "10": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#10HonorGuard",
  "11": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#11SecretRoom",
  "12": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#12TombofaFailedDragonpriest",
  "13": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#13EmptyRoom",
  "14": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#14EnchantedWaterCache",
  "15": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#15DragonCell",
  "16": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#16KoboldGuardroom",
  "17": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#17DragonChow",
  "18": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#18Prison",
  "19": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#19HallofDragons",
  "20": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#20KoboldColony",
  "21": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#21DragonThrone",
  "22": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#22Larder",
  "23": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#23UnderdarkAccess",
  "24": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#24TrappedAccess",
  "25": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#25EmptyChamber",
  "26": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#26DryFountain",
  "27": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#27Sanctuary",
  "28": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#28InfestedCells",
  "29": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#29DisabledTraps",
  "30": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#30MamaRat",
  "31": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#31CaltropHall",
  "32": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#32GoblinGate",
  "33": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#33PracticeRange",
  "34": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#34GoblinStockade",
  "35": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#35TrappedCorridor",
  "36": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#36GoblinBandits",
  "37": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#37TrophyRoom",
  "38": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#38GoblinPantry",
  "39": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#39DragonHaze",
  "40": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#40Goblinville",
  "41": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#41HalloftheGoblinChief",
  "42": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#42CentralGarden",
  "43": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#43TheGreatHuntersAbode",
  "44": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#44Rift",
  "45": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#45RiftNode",
  "46": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#46OldShrine",
  "47": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#47BelaksLaboratory",
  "48": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#48GardenGalleries",
  "49": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#49Arboretums",
  "50": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#50AshardalonsShrine",
  "51": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#51DragonLibrary",
  "52": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#52Underpass",
  "53": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#53BelaksStudy",
  "54": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#54GroveGate",
  "55": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#55TwilightGrove",
  "56": "https://www.dndbeyond.com/sources/dnd/tftyp/a1/the-sunless-citadel#56TheGulthiasTree"
};

export const NAMES: Record<string, string> = {
  "1": "Ledge",
  "2": "Switchback Stairs",
  "3": "Crumbled Courtyard",
  "4": "Tower Shell",
  "5": "Secret Pocket",
  "6": "Old Approach",
  "7": "Gallery of Forlorn Notes",
  "8": "Pressure Plate",
  "9": "Dragon Riddle",
  "10": "Honor Guard",
  "11": "Secret Room",
  "12": "Tomb of a Failed Dragonpriest",
  "13": "Empty Room",
  "14": "Enchanted Water Cache",
  "15": "Dragon Cell",
  "16": "Kobold Guardroom",
  "17": "Dragon Chow",
  "18": "Prison",
  "19": "Hall of Dragons",
  "20": "Kobold Colony",
  "21": "Dragon Throne",
  "22": "Larder",
  "23": "Underdark Access",
  "24": "Trapped Access",
  "25": "Empty Chamber",
  "26": "Dry Fountain",
  "27": "Sanctuary",
  "28": "Infested Cells",
  "29": "Disabled Traps",
  "30": "Mama Rat",
  "31": "Caltrop Hall",
  "32": "Goblin Gate",
  "33": "Practice Range",
  "34": "Goblin Stockade",
  "35": "Trapped Corridor",
  "36": "Goblin Bandits",
  "37": "Trophy Room",
  "38": "Goblin Pantry",
  "39": "Dragon Haze",
  "40": "Goblinville",
  "41": "Hall of the Goblin Chief"
};

/* room numbers printed on this map, in chip order */
export const EXPECTED: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41"];

export const MAP = {
  title: "Fortress Level",
  src: mapImage,
  width: 450,
  height: 932,
};
