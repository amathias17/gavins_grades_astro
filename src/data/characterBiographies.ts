export interface CharacterBiography {
  badgeId: string;
  title: string;
  bio: string;
  facts: string[];
}

export const characterBiographies: CharacterBiography[] = [
  {
    badgeId: "yamcha",
    title: "Desert fighter turned dependable ally",
    bio: "Yamcha began as a desert bandit who feared speaking to women, then grew into one of Earth's earliest defenders. His confidence, loyalty, and willingness to face stronger opponents make him a fitting first step in the power archive.",
    facts: ["His signature technique is the Wolf Fang Fist.", "He was one of Goku's first rivals and later became a close friend.", "Outside battle, Yamcha became a successful professional baseball player."],
  },
  {
    badgeId: "piccolo",
    title: "The strategist who chose to protect Earth",
    bio: "Piccolo was born to defeat Goku, but training Gohan changed the course of his life. Calm under pressure and brilliant in battle, he became a mentor whose planning often matters as much as raw power.",
    facts: ["Piccolo is a Namekian and can regenerate damaged limbs.", "He develops a close mentor bond with Gohan.", "His Special Beam Cannon concentrates energy into a piercing spiral."],
  },
  {
    badgeId: "gohan",
    title: "A scholar with extraordinary hidden strength",
    bio: "Gohan balances a gentle nature and love of learning with power that surges when the people he cares about are threatened. His greatest victories come when courage finally unlocks the potential everyone else can see in him.",
    facts: ["Gohan is Goku and Chi-Chi's eldest son.", "Piccolo trained him and became one of his closest mentors.", "He was the first Saiyan shown reaching Super Saiyan 2."],
  },
  {
    badgeId: "vegeta",
    title: "The Saiyan prince who never stops improving",
    bio: "Vegeta arrived on Earth as a ruthless invader and gradually became one of its fiercest protectors. Pride drives his rivalry with Goku, while discipline and devotion to his family reshape what strength means to him.",
    facts: ["Vegeta is the prince of the fallen Saiyan race.", "His rivalry with Goku fuels years of intense training.", "The Final Flash is one of his best-known energy attacks."],
  },
  {
    badgeId: "goku",
    title: "Earth's joyful defender and lifelong student",
    bio: "Goku approaches every challenge with curiosity, kindness, and an endless desire to improve. Raised on Earth but born a Saiyan, he repeatedly turns former rivals into allies and pushes beyond his limits when others need him.",
    facts: ["His Saiyan birth name is Kakarot.", "Master Roshi taught him the Kamehameha.", "He often learns most quickly by testing himself against a stronger opponent."],
  },
  {
    badgeId: "gogeta",
    title: "A fusion built from perfect coordination",
    bio: "Gogeta is created when Goku and Vegeta perform the Fusion Dance in complete synchronization. He combines their skill, speed, experience, and enormous power into a focused warrior with little time to waste.",
    facts: ["The Fusion Dance requires both fighters to match their power levels.", "A successful fusion normally lasts about thirty minutes.", "Gogeta shares qualities from both Goku and Vegeta while acting as his own fighter."],
  },
  {
    badgeId: "frieza",
    title: "The calculating emperor of the universe",
    bio: "Frieza rules through fear, overwhelming force, and careful manipulation. His conflict with the Saiyans shapes generations of Dragon Ball history, and his talent for rapid growth makes every return more dangerous.",
    facts: ["Frieza destroyed Planet Vegeta after fearing the Saiyans' potential.", "He uses several forms to control or amplify his power.", "His battle with Goku on Namek led to Goku's first Super Saiyan transformation."],
  },
  {
    badgeId: "broly",
    title: "A quiet warrior carrying legendary power",
    bio: "Broly grew up isolated on the harsh planet Vampa, where survival shaped his immense natural strength. Though his power can become uncontrollable, his story is also about trust, friendship, and finding a life beyond someone else's anger.",
    facts: ["Broly survived for years on Vampa with his father, Paragus.", "His strength rises dramatically as a fight continues.", "Cheelai and Lemo become his first true friends."],
  },
  {
    badgeId: "goku-ultra-instinct",
    title: "Movement beyond conscious thought",
    bio: "Ultra Instinct lets Goku's body react without waiting for deliberate thought. Reaching it requires calm inside extreme pressure, turning mastery of movement and focus into a level of skill even gods struggle to attain.",
    facts: ["Ultra Instinct separates physical reaction from conscious decision-making.", "Whis has trained Goku toward this principle for years.", "Maintaining the completed form places a severe strain on Goku's body."],
  },
  {
    badgeId: "beerus",
    title: "A destroyer whose power keeps cosmic balance",
    bio: "Beerus is Universe 7's God of Destruction, responsible for removing worlds so creation can continue in balance. His moods are unpredictable, but beneath them is a fighter whose effortless technique reveals how far mortals still have to climb.",
    facts: ["Whis serves as Beerus's attendant and martial arts teacher.", "Beerus loves Earth's food, especially new dishes.", "His destructive energy can erase a target rather than simply damage it."],
  },
  {
    badgeId: "jiren",
    title: "Strength forged through absolute discipline",
    bio: "Jiren is Universe 11's strongest Pride Trooper and a warrior whose power rivals the gods. His belief in solitary strength is tested when Goku and his allies show how trust can create power no one fighter can reach alone.",
    facts: ["Jiren represents Universe 11 in the Tournament of Power.", "He belongs to the heroic Pride Troopers.", "His calm control allows him to release enormous power with very little wasted movement."],
  },
];

export function getCharacterBiography(badgeId: string): CharacterBiography | undefined {
  return characterBiographies.find((biography) => biography.badgeId === badgeId);
}
