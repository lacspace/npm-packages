/**
 * Small embedded diceware-style wordlist for passphrase generation.
 *
 * 256 short, common, unambiguous English words → log2(256) = 8 bits of entropy
 * per word. Deliberately compact to keep the package tiny; for maximum entropy
 * per word pass your own larger list to `generatePassphrase`.
 */
export const WORDLIST: readonly string[] = [
  "able", "acid", "acorn", "actor", "afar", "agile", "album", "alert", "alley", "amber",
  "angel", "angle", "ankle", "apex", "apple", "apron", "arbor", "arena", "argon", "armor",
  "aroma", "arrow", "atlas", "atom", "aunt", "aura", "auto", "axis", "bacon", "badge",
  "baker", "balmy", "banjo", "barge", "basil", "batch", "beach", "beard", "beast", "bench",
  "berry", "birch", "bison", "blade", "blaze", "blend", "bliss", "block", "bloom", "board",
  "bonus", "boost", "booth", "brave", "bread", "brick", "brisk", "broom", "brush", "buddy",
  "bugle", "bunny", "cabin", "cable", "cacao", "cadet", "camel", "candy", "canoe", "canon",
  "cargo", "carol", "cedar", "chalk", "charm", "chase", "cheer", "chess", "chief", "chime",
  "cider", "cigar", "civic", "clamp", "clash", "clay", "clerk", "cliff", "cloak", "clock",
  "cloud", "clove", "clump", "coast", "cobra", "cocoa", "comet", "coral", "cove", "crane",
  "crate", "creek", "crest", "crisp", "crown", "crumb", "curve", "cyan", "daisy", "dance",
  "dandy", "dart", "dawn", "delta", "denim", "diary", "diner", "disk", "ditch", "dizzy",
  "dock", "dodge", "donor", "dough", "dove", "draft", "drake", "drama", "dream", "dress",
  "drift", "drum", "dusk", "eager", "eagle", "early", "earth", "easel", "ebony", "elbow",
  "elder", "elfin", "elite", "elm", "ember", "emu", "envoy", "epoch", "equal", "essay",
  "ether", "extra", "fable", "fairy", "falcon", "fancy", "fauna", "feast", "felt", "fern",
  "ferry", "fetch", "fever", "fiber", "field", "fig", "final", "finch", "fjord", "flame",
  "flare", "flask", "fleet", "flint", "float", "flock", "flora", "flute", "foam", "focus",
  "forge", "fossil", "fox", "frame", "frost", "fruit", "fudge", "gable", "gala", "gauge",
  "gecko", "gem", "ghost", "giant", "ginger", "glade", "glaze", "glide", "globe", "glory",
  "glove", "glow", "goat", "gold", "golem", "grain", "grape", "grasp", "grove", "guava",
  "guide", "gulf", "gully", "hail", "halo", "hardy", "harp", "hasty", "haven", "hawk",
  "hazel", "heart", "hedge", "hefty", "helm", "herb", "hero", "hippo", "hive", "hobby",
  "honey", "horse", "hotel", "hound", "house", "hover", "human", "humor", "husky", "ideal",
  "igloo", "index", "inlet", "input", "ivory", "jade", "jazz", "jelly", "jewel", "jolly",
  "joust", "judge", "juice", "kayak", "kebab", "kelp",
];
