// Fire names as written in Portuguese: the PT-FireSprd case folders drop accents and spaces ("SaoJoaoPesqueira_10072020").
const PLACES: Record<string, string> = {
  Agueda: "Águeda",
  Alijo: "Alijó",
  Baiao: "Baião",
  CabeceirasdeBasto: "Cabeceiras de Basto",
  CasteloBranco: "Castelo Branco",
  CastroDaire: "Castro Daire",
  CastroMarim: "Castro Marim",
  FreixoEspadaaCinta: "Freixo de Espada à Cinta",
  Fundao: "Fundão",
  IdanhaaNova: "Idanha-a-Nova",
  MirandadoCorvo: "Miranda do Corvo",
  OliveiraFrades: "Oliveira de Frades",
  PortoMos: "Porto de Mós",
  ProencaaNova: "Proença-a-Nova",
  SaoJoaoPesqueira: "São João da Pesqueira",
  Serta: "Sertã",
  Valenca: "Valença",
  Valpacos: "Valpaços",
  ViladeRei: "Vila de Rei",
  VieiradoMinho: "Vieira do Minho",
};

/** "Valenca_04092019" → "Valença 2019". */
export function fireName(fire: string): string {
  const [place, date] = fire.split("_");
  return `${PLACES[place] ?? place.replace(/([a-z])([A-Z])/g, "$1 $2")} ${date?.slice(-4) ?? ""}`.trim();
}
