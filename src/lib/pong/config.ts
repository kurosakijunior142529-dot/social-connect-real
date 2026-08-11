// Catálogo extensível do Ping Pong: poderes, arenas e cosméticos.
// Para adicionar conteúdo novo basta acrescentar entradas aqui —
// o motor do jogo lê tudo deste registro.

export const FIELD = {
  /** largura em unidades de campo */
  w: 1,
  /** altura em unidades de campo (portrait) */
  h: 1.5,
  ballR: 0.026,
  paddleHalf: 0.115,
  paddleH: 0.026,
  paddleInset: 0.09,
  baseSpeed: 0.95,
  maxSpeed: 2.1,
  paddleSpeed: 2.6,
  winScore: 7,
} as const;

export type PowerId =
  // originais
  | "teleport" | "rewind" | "gravity" | "portal" | "shield" | "clone"
  | "magnet" | "speed" | "reflex" | "freeze" | "shrink" | "wall"
  | "fury" | "ghost"
  // novos
  | "curve" | "blackhole" | "invert" | "fog" | "slowmo" | "hyper"
  | "laser" | "swap" | "quake" | "vortex" | "stealth" | "recall"
  | "spikes" | "sentinel" | "chaos" | "overdrive" | "steal" | "giant"
  | "tiny" | "sticky"
  // expansão 3D — espaço/bola
  | "wrap" | "ceiling" | "anchor" | "fuse" | "saw" | "current"
  | "damp" | "fork" | "heavy" | "feather"
  // expansão 3D — raquete/próprio
  | "dash" | "root" | "split" | "counter" | "parry" | "tether"
  | "shift" | "bulwark" | "secondwind" | "serveback"
  // expansão 3D — adversário
  | "blind" | "jam" | "drift" | "silence" | "leech" | "mirror"
  | "narrow" | "lead" | "deadzone" | "taunt"
  // expansão 3D — arena/regras
  | "golden" | "vault" | "netrise" | "haven" | "bubble" | "momentum"
  | "overload" | "gambit" | "curtain" | "resonance";

export type PowerCategory = "ataque" | "defesa" | "controle" | "caos";

export type PowerDef = {
  id: PowerId;
  name: string;
  emoji: string;
  /** frase curta: o que acontece na prática */
  desc: string;
  /** em quem o efeito recai */
  target: "self" | "enemy" | "ball";
  category: PowerCategory;
  /** 1–3, dificuldade de dominar */
  tier: 1 | 2 | 3;
  /** segundos de recarga */
  cooldown: number;
  /** segundos de duração do efeito (0 = instantâneo) */
  duration: number;
  color: string;
};

export const POWERS: PowerDef[] = [
  /* ---------------- controle ---------------- */
  {
    id: "rewind", name: "Tempo", emoji: "⏳", category: "controle", tier: 3,
    desc: "Volta a partida 10 segundos: bola, raquetes e placar retornam ao que eram.",
    target: "ball", cooldown: 26, duration: 0, color: "#facc15",
  },
  {
    id: "teleport", name: "Teleporte", emoji: "✨", category: "defesa", tier: 1,
    desc: "Sua raquete pisca instantaneamente para debaixo da bola.",
    target: "self", cooldown: 8, duration: 0, color: "#8b5cf6",
  },
  {
    id: "freeze", name: "Congelar", emoji: "❄️", category: "controle", tier: 2,
    desc: "A raquete do adversário fica travada por 2s.",
    target: "enemy", cooldown: 18, duration: 2, color: "#67e8f9",
  },
  {
    id: "shrink", name: "Encolher", emoji: "🔻", category: "controle", tier: 1,
    desc: "A raquete do adversário fica 45% menor por 6s.",
    target: "enemy", cooldown: 18, duration: 6, color: "#fb7185",
  },
  {
    id: "wall", name: "Muralha", emoji: "🧱", category: "defesa", tier: 1,
    desc: "Ergue uma barreira que rebate a bola na frente da sua raquete por 5s.",
    target: "self", cooldown: 20, duration: 5, color: "#a3a3a3",
  },
  {
    id: "fury", name: "Fúria", emoji: "🔥", category: "ataque", tier: 1,
    desc: "Sua próxima defesa vira um smash: a bola sai 80% mais rápida.",
    target: "self", cooldown: 15, duration: 8, color: "#f97316",
  },
  {
    id: "ghost", name: "Fantasma", emoji: "👻", category: "caos", tier: 2,
    desc: "Por 4s a bola quase some quando entra no campo do adversário.",
    target: "enemy", cooldown: 19, duration: 4, color: "#e5e7eb",
  },
  {
    id: "gravity", name: "Gravidade", emoji: "🌀", category: "ataque", tier: 2,
    desc: "Por 4s a bola é puxada para o fundo do campo adversário.",
    target: "ball", cooldown: 16, duration: 4, color: "#38bdf8",
  },
  {
    id: "portal", name: "Portal", emoji: "🌌", category: "caos", tier: 2,
    desc: "Por 5s a bola atravessa o meio e reaparece espelhada do outro lado.",
    target: "ball", cooldown: 18, duration: 5, color: "#a855f7",
  },
  {
    id: "shield", name: "Escudo", emoji: "🛡️", category: "defesa", tier: 1,
    desc: "Segura um ponto contra você: a bola volta ao jogo uma vez em 12s.",
    target: "self", cooldown: 22, duration: 12, color: "#22d3ee",
  },
  {
    id: "clone", name: "Clone", emoji: "👥", category: "defesa", tier: 2,
    desc: "Uma segunda raquete espelha a sua e defende à frente por 6s.",
    target: "self", cooldown: 20, duration: 6, color: "#f472b6",
  },
  {
    id: "magnet", name: "Magnetismo", emoji: "🧲", category: "defesa", tier: 1,
    desc: "Sua raquete fica 55% maior por 6s.",
    target: "self", cooldown: 16, duration: 6, color: "#c084fc",
  },
  {
    id: "speed", name: "Velocidade", emoji: "⚡", category: "defesa", tier: 1,
    desc: "Sua raquete se move 70% mais rápido por 6s.",
    target: "self", cooldown: 14, duration: 6, color: "#34d399",
  },
  {
    id: "reflex", name: "Reflexo", emoji: "🎯", category: "ataque", tier: 1,
    desc: "Por 6s toda defesa sai com ângulo perfeito e 35% mais força.",
    target: "self", cooldown: 17, duration: 6, color: "#fbbf24",
  },

  /* ---------------- novos ---------------- */
  {
    id: "curve", name: "Curva", emoji: "🪃", category: "ataque", tier: 2,
    desc: "Por 7s suas bolas saem com efeito e fazem curva no ar.",
    target: "self", cooldown: 16, duration: 7, color: "#2dd4bf",
  },
  {
    id: "blackhole", name: "Buraco Negro", emoji: "🕳️", category: "ataque", tier: 3,
    desc: "Abre um poço no campo do rival que suga a bola por 5s.",
    target: "enemy", cooldown: 24, duration: 5, color: "#818cf8",
  },
  {
    id: "invert", name: "Inversão", emoji: "🔄", category: "controle", tier: 3,
    desc: "Inverte os controles do adversário por 5s.",
    target: "enemy", cooldown: 22, duration: 5, color: "#f0abfc",
  },
  {
    id: "fog", name: "Neblina", emoji: "🌫️", category: "caos", tier: 2,
    desc: "Cobre a visão do adversário com névoa densa por 5s.",
    target: "enemy", cooldown: 20, duration: 5, color: "#cbd5e1",
  },
  {
    id: "slowmo", name: "Câmera Lenta", emoji: "🐢", category: "defesa", tier: 1,
    desc: "A bola fica 45% mais lenta dentro do seu campo por 5s.",
    target: "self", cooldown: 16, duration: 5, color: "#7dd3fc",
  },
  {
    id: "hyper", name: "Hiper", emoji: "🚀", category: "ataque", tier: 2,
    desc: "A bola acelera 60% dentro do campo do rival por 5s.",
    target: "enemy", cooldown: 19, duration: 5, color: "#fb923c",
  },
  {
    id: "laser", name: "Laser", emoji: "🔫", category: "ataque", tier: 2,
    desc: "Dispara um raio que arremessa a bola direto para o campo rival.",
    target: "ball", cooldown: 15, duration: 0, color: "#ef4444",
  },
  {
    id: "swap", name: "Troca", emoji: "🔀", category: "caos", tier: 2,
    desc: "Troca a posição da sua raquete com a do adversário.",
    target: "ball", cooldown: 17, duration: 0, color: "#60a5fa",
  },
  {
    id: "quake", name: "Terremoto", emoji: "🌎", category: "controle", tier: 2,
    desc: "O campo treme e a raquete do rival vibra sem controle por 5s.",
    target: "enemy", cooldown: 20, duration: 5, color: "#d97706",
  },
  {
    id: "vortex", name: "Vórtice", emoji: "🌪️", category: "caos", tier: 3,
    desc: "Um redemoinho curva a trajetória da bola no campo rival por 5s.",
    target: "enemy", cooldown: 21, duration: 5, color: "#22c55e",
  },
  {
    id: "stealth", name: "Camuflagem", emoji: "🥷", category: "defesa", tier: 2,
    desc: "Sua raquete fica invisível para o adversário por 6s.",
    target: "self", cooldown: 18, duration: 6, color: "#94a3b8",
  },
  {
    id: "recall", name: "Retorno", emoji: "🔙", category: "defesa", tier: 1,
    desc: "Puxa a bola de volta ao centro e devolve o saque para você.",
    target: "ball", cooldown: 14, duration: 0, color: "#a5b4fc",
  },
  {
    id: "spikes", name: "Espinhos", emoji: "🦔", category: "ataque", tier: 2,
    desc: "Por 6s suas defesas saem em ângulos imprevisíveis e 30% mais fortes.",
    target: "self", cooldown: 17, duration: 6, color: "#84cc16",
  },
  {
    id: "sentinel", name: "Sentinela", emoji: "🤖", category: "defesa", tier: 3,
    desc: "Uma raquete autônoma persegue a bola no seu campo por 7s.",
    target: "self", cooldown: 24, duration: 7, color: "#38bdf8",
  },
  {
    id: "chaos", name: "Caos", emoji: "🎲", category: "caos", tier: 3,
    desc: "A bola dá solavancos aleatórios no campo do rival por 4s.",
    target: "enemy", cooldown: 20, duration: 4, color: "#e879f9",
  },
  {
    id: "overdrive", name: "Overdrive", emoji: "⚙️", category: "controle", tier: 2,
    desc: "Sua recarga fica 50% mais rápida por 10s.",
    target: "self", cooldown: 22, duration: 10, color: "#fde047",
  },
  {
    id: "steal", name: "Roubo", emoji: "🏴‍☠️", category: "controle", tier: 3,
    desc: "Rouba 1 ponto do adversário — só funciona se você estiver perdendo.",
    target: "enemy", cooldown: 30, duration: 0, color: "#f43f5e",
  },
  {
    id: "giant", name: "Bola Gigante", emoji: "🪐", category: "caos", tier: 1,
    desc: "A bola fica 70% maior por 6s — mais fácil de acertar, mais difícil de esconder.",
    target: "ball", cooldown: 16, duration: 6, color: "#fcd34d",
  },
  {
    id: "tiny", name: "Bola Minúscula", emoji: "🫧", category: "caos", tier: 2,
    desc: "A bola encolhe 45% por 5s e vira um alvo quase invisível.",
    target: "ball", cooldown: 18, duration: 5, color: "#bae6fd",
  },
  {
    id: "sticky", name: "Grude", emoji: "🍯", category: "controle", tier: 2,
    desc: "A próxima bola gruda na sua raquete e é relançada com mira perfeita.",
    target: "self", cooldown: 16, duration: 8, color: "#eab308",
  },

  /* ---------------- expansão 3D: espaço e bola ---------------- */
  {
    id: "wrap", name: "Fronteira Aberta", emoji: "🌐", category: "caos", tier: 2,
    desc: "Por 6s as laterais viram portais: a bola some de um lado e volta do outro.",
    target: "ball", cooldown: 18, duration: 6, color: "#5eead4",
  },
  {
    id: "ceiling", name: "Teto", emoji: "🔲", category: "ataque", tier: 2,
    desc: "Cria uma placa no fundo do campo rival que rebate a bola de volta por 5s.",
    target: "enemy", cooldown: 21, duration: 5, color: "#93c5fd",
  },
  {
    id: "anchor", name: "Âncora", emoji: "⚓", category: "defesa", tier: 1,
    desc: "Por 6s a bola perde 30% da velocidade toda vez que entra no seu campo.",
    target: "self", cooldown: 17, duration: 6, color: "#60a5fa",
  },
  {
    id: "fuse", name: "Estopim", emoji: "🧨", category: "caos", tier: 3,
    desc: "Por 10s cada rebatida acelera a bola 8% — para os dois lados.",
    target: "ball", cooldown: 24, duration: 10, color: "#f97316",
  },
  {
    id: "saw", name: "Serrote", emoji: "📈", category: "ataque", tier: 2,
    desc: "No campo rival a bola zigueza­gueia em serra por 5s.",
    target: "enemy", cooldown: 19, duration: 5, color: "#fb7185",
  },
  {
    id: "current", name: "Correnteza", emoji: "🌊", category: "controle", tier: 2,
    desc: "Uma corrente lateral empurra a bola no campo rival por 6s.",
    target: "enemy", cooldown: 18, duration: 6, color: "#22d3ee",
  },
  {
    id: "damp", name: "Amortecer", emoji: "🪶", category: "defesa", tier: 1,
    desc: "Por 6s a bola perde metade da força ao bater nas laterais do seu campo.",
    target: "self", cooldown: 15, duration: 6, color: "#a7f3d0",
  },
  {
    id: "fork", name: "Bifurcação", emoji: "🔱", category: "ataque", tier: 2,
    desc: "Sua próxima rebatida mira sozinha o canto mais longe do rival.",
    target: "self", cooldown: 16, duration: 8, color: "#c4b5fd",
  },
  {
    id: "heavy", name: "Peso", emoji: "🪨", category: "controle", tier: 2,
    desc: "Por 4s as devoluções do rival saem retas, sem ângulo.",
    target: "enemy", cooldown: 19, duration: 4, color: "#9ca3af",
  },
  {
    id: "feather", name: "Pluma", emoji: "🕊️", category: "defesa", tier: 1,
    desc: "Por 8s a bola quase para ao chegar no fundo do seu campo.",
    target: "self", cooldown: 18, duration: 8, color: "#e0f2fe",
  },

  /* ---------------- expansão 3D: raquete ---------------- */
  {
    id: "dash", name: "Arranque", emoji: "💨", category: "defesa", tier: 1,
    desc: "Impulso lateral instantâneo na direção em que você está indo.",
    target: "self", cooldown: 7, duration: 0, color: "#38bdf8",
  },
  {
    id: "root", name: "Fixar", emoji: "🌳", category: "defesa", tier: 2,
    desc: "Sua raquete trava no lugar por 3s, mas fica com o dobro do tamanho.",
    target: "self", cooldown: 18, duration: 3, color: "#4ade80",
  },
  {
    id: "split", name: "Divisão", emoji: "✂️", category: "defesa", tier: 3,
    desc: "Sua raquete se parte em duas metades afastadas por 6s — cobre mais, mas com buraco no meio.",
    target: "self", cooldown: 20, duration: 6, color: "#f0abfc",
  },
  {
    id: "counter", name: "Contragolpe", emoji: "🥊", category: "ataque", tier: 2,
    desc: "Por 4s, bolas rápidas voltam com o dobro da velocidade.",
    target: "self", cooldown: 18, duration: 4, color: "#ef4444",
  },
  {
    id: "parry", name: "Aparar", emoji: "⚔️", category: "ataque", tier: 3,
    desc: "Janela de 0,7s: acertar a bola devolve no máximo e trava o rival por 1s.",
    target: "self", cooldown: 16, duration: 0.7, color: "#fde047",
  },
  {
    id: "tether", name: "Corda", emoji: "🪢", category: "defesa", tier: 1,
    desc: "Por 5s sua raquete acompanha a bola sozinha em parte do caminho.",
    target: "self", cooldown: 17, duration: 5, color: "#fbbf24",
  },
  {
    id: "shift", name: "Deslocar", emoji: "↔️", category: "controle", tier: 1,
    desc: "Sua raquete salta para a posição espelhada do campo.",
    target: "self", cooldown: 9, duration: 0, color: "#a78bfa",
  },
  {
    id: "bulwark", name: "Reforço", emoji: "🏰", category: "defesa", tier: 2,
    desc: "Por 6s suas devoluções não perdem velocidade, mas saem sem ângulo.",
    target: "self", cooldown: 18, duration: 6, color: "#94a3b8",
  },
  {
    id: "secondwind", name: "Fôlego", emoji: "🌬️", category: "controle", tier: 2,
    desc: "Zera sua recarga depois de 3s — se tomar ponto antes, é cancelado.",
    target: "self", cooldown: 26, duration: 3, color: "#67e8f9",
  },
  {
    id: "serveback", name: "Sacada", emoji: "🎾", category: "controle", tier: 1,
    desc: "Você recebe o próximo saque, tenha marcado ou não.",
    target: "self", cooldown: 20, duration: 12, color: "#bef264",
  },

  /* ---------------- expansão 3D: adversário ---------------- */
  {
    id: "blind", name: "Ofuscar", emoji: "💡", category: "caos", tier: 1,
    desc: "Um clarão cega a tela do rival por 1,2s.",
    target: "enemy", cooldown: 14, duration: 1.2, color: "#fef08a",
  },
  {
    id: "jam", name: "Interferência", emoji: "📡", category: "controle", tier: 3,
    desc: "Por 5s o comando do rival responde com atraso.",
    target: "enemy", cooldown: 22, duration: 5, color: "#f472b6",
  },
  {
    id: "drift", name: "Deriva", emoji: "🧭", category: "controle", tier: 2,
    desc: "Por 6s a raquete do rival escorrega sozinha para a lateral.",
    target: "enemy", cooldown: 19, duration: 6, color: "#38bdf8",
  },
  {
    id: "silence", name: "Silenciar", emoji: "🔇", category: "controle", tier: 3,
    desc: "Por 6s o rival não consegue usar poderes.",
    target: "enemy", cooldown: 26, duration: 6, color: "#a855f7",
  },
  {
    id: "leech", name: "Sanguessuga", emoji: "🩸", category: "controle", tier: 2,
    desc: "Por 8s a recarga do rival demora o dobro.",
    target: "enemy", cooldown: 22, duration: 8, color: "#dc2626",
  },
  {
    id: "mirror", name: "Espelho Falso", emoji: "🪞", category: "caos", tier: 3,
    desc: "Por 4s o rival vê a bola espelhada na tela.",
    target: "enemy", cooldown: 22, duration: 4, color: "#e879f9",
  },
  {
    id: "narrow", name: "Estreitar", emoji: "🧿", category: "ataque", tier: 2,
    desc: "Por 6s as laterais do campo rival se fecham e matam os ângulos.",
    target: "enemy", cooldown: 20, duration: 6, color: "#fb923c",
  },
  {
    id: "lead", name: "Chumbo", emoji: "🔩", category: "controle", tier: 1,
    desc: "Por 5s a raquete do rival fica 45% mais lenta.",
    target: "enemy", cooldown: 17, duration: 5, color: "#78716c",
  },
  {
    id: "deadzone", name: "Zona Morta", emoji: "🚫", category: "caos", tier: 2,
    desc: "Uma faixa do campo rival apaga a bola por 5s.",
    target: "enemy", cooldown: 20, duration: 5, color: "#64748b",
  },
  {
    id: "taunt", name: "Provocação", emoji: "😜", category: "caos", tier: 1,
    desc: "Puxa a raquete do rival para o meio e a trava por 0,5s.",
    target: "enemy", cooldown: 13, duration: 0.5, color: "#fca5a5",
  },

  /* ---------------- expansão 3D: arena e regras ---------------- */
  {
    id: "golden", name: "Ponto de Ouro", emoji: "🥇", category: "caos", tier: 3,
    desc: "A próxima disputa vale 2 pontos — para quem ganhar.",
    target: "ball", cooldown: 28, duration: 0, color: "#fbbf24",
  },
  {
    id: "vault", name: "Cofre", emoji: "🏦", category: "ataque", tier: 2,
    desc: "Se você vencer esta disputa com 6+ toques, ganha 1 ponto extra.",
    target: "self", cooldown: 22, duration: 14, color: "#facc15",
  },
  {
    id: "netrise", name: "Rede Alta", emoji: "🕸️", category: "controle", tier: 3,
    desc: "Por 5s uma rede no meio barra bolas fracas — só passa quem bate forte.",
    target: "ball", cooldown: 23, duration: 5, color: "#22c55e",
  },
  {
    id: "haven", name: "Refúgio", emoji: "🛟", category: "defesa", tier: 1,
    desc: "Um campo de força no seu lado puxa a bola para o centro por 5s.",
    target: "self", cooldown: 18, duration: 5, color: "#34d399",
  },
  {
    id: "bubble", name: "Bolha Temporal", emoji: "🫧", category: "controle", tier: 2,
    desc: "Por 6s o meio do campo fica em câmera lenta para os dois.",
    target: "ball", cooldown: 21, duration: 6, color: "#a5f3fc",
  },
  {
    id: "momentum", name: "Ímpeto", emoji: "📶", category: "ataque", tier: 3,
    desc: "Por 8s cada rebatida sua deixa sua raquete maior e mais rápida.",
    target: "self", cooldown: 23, duration: 8, color: "#f59e0b",
  },
  {
    id: "overload", name: "Sobrecarga", emoji: "🔋", category: "controle", tier: 3,
    desc: "O próximo poder que você usar dura o dobro.",
    target: "self", cooldown: 25, duration: 15, color: "#a3e635",
  },
  {
    id: "gambit", name: "Aposta", emoji: "🎰", category: "caos", tier: 3,
    desc: "Perde 1 ponto na hora; por 10s suas devoluções voam e a recarga cai pela metade.",
    target: "self", cooldown: 30, duration: 10, color: "#f43f5e",
  },
  {
    id: "curtain", name: "Cortina", emoji: "🎭", category: "caos", tier: 2,
    desc: "Uma barra atravessa o meio do campo por 4s e os dois têm que desviar.",
    target: "ball", cooldown: 20, duration: 4, color: "#c084fc",
  },
  {
    id: "resonance", name: "Ressonância", emoji: "🔊", category: "ataque", tier: 2,
    desc: "Por 10s, enquanto você estiver perdendo, a bola acelera a cada toque seu.",
    target: "self", cooldown: 21, duration: 10, color: "#2dd4bf",
  },
];

export const POWER_MAP: Record<PowerId, PowerDef> = Object.fromEntries(
  POWERS.map((p) => [p.id, p]),
) as Record<PowerId, PowerDef>;

export const POWER_CATEGORIES: { id: PowerCategory; name: string; emoji: string }[] = [
  { id: "ataque", name: "Ataque", emoji: "⚔️" },
  { id: "defesa", name: "Defesa", emoji: "🛡️" },
  { id: "controle", name: "Controle", emoji: "🎛️" },
  { id: "caos", name: "Caos", emoji: "🌀" },
];

export type ArenaDef = {
  id: string;
  name: string;
  bg: [string, string];
  line: string;
  glow: string;
  accent: string;
  unlockLevel: number;
};

export const ARENAS: ArenaDef[] = [
  { id: "neon", name: "Neon", bg: ["#0b1020", "#131a34"], line: "rgba(255,255,255,0.14)", glow: "#7c5cff", accent: "#22d3ee", unlockLevel: 1 },
  { id: "sunset", name: "Pôr do sol", bg: ["#2a1030", "#4a1a2c"], line: "rgba(255,255,255,0.12)", glow: "#ff7a59", accent: "#fbbf24", unlockLevel: 3 },
  { id: "deep", name: "Abissal", bg: ["#04161c", "#062a33"], line: "rgba(255,255,255,0.1)", glow: "#22d3ee", accent: "#34d399", unlockLevel: 5 },
  { id: "void", name: "Vazio", bg: ["#0a0a0c", "#1a1520"], line: "rgba(255,255,255,0.08)", glow: "#f472b6", accent: "#a855f7", unlockLevel: 8 },
];

export type SkinDef = { id: string; name: string; color: string; trail: string; unlockLevel: number };

export const PADDLE_SKINS: SkinDef[] = [
  { id: "aurora", name: "Aurora", color: "#7c5cff", trail: "#a78bfa", unlockLevel: 1 },
  { id: "lime", name: "Lima", color: "#34d399", trail: "#86efac", unlockLevel: 2 },
  { id: "solar", name: "Solar", color: "#fb923c", trail: "#fdba74", unlockLevel: 4 },
  { id: "ice", name: "Gelo", color: "#38bdf8", trail: "#bae6fd", unlockLevel: 6 },
];

export const BALL_SKINS: SkinDef[] = [
  { id: "classic", name: "Clássica", color: "#ffffff", trail: "rgba(255,255,255,0.5)", unlockLevel: 1 },
  { id: "ember", name: "Brasa", color: "#fca5a5", trail: "rgba(248,113,113,0.55)", unlockLevel: 3 },
  { id: "plasma", name: "Plasma", color: "#c4b5fd", trail: "rgba(167,139,250,0.55)", unlockLevel: 5 },
];

export function levelFromXp(xp: number) {
  return 1 + Math.floor(xp / 500);
}
export function xpProgress(xp: number) {
  const into = xp % 500;
  return { into, need: 500, pct: Math.round((into / 500) * 100) };
}
