/** Decorative Research Editions. Coordinates describe art, never project facts. */
type Tone = 'solid' | 'light' | 'sand' | 'canvas' | 'ink';
type Plate = { d: string; tone: Tone; opacity?: number; line?: true };
type Scene = { id: string; name: string; plates: readonly Plate[] };
export const coverScenes = [
  {
    id: 'evidence-atlas',
    name: 'Evidence Atlas',
    plates: [
      { tone: 'light', d: 'M280 165H1070V690H280Z' },
      { tone: 'sand', d: 'M805 355H1320V790H805Z' },
      { tone: 'solid', d: 'M190 280H890V490H1040V825H190Z' },
      { tone: 'canvas', d: 'M610 280H700V825H610Z' },
      {
        tone: 'light',
        line: true,
        d: 'M245 350H550M245 375H550M245 400H460M245 720H550M760 550H970M760 575H970M760 600H910',
      },
      {
        tone: 'ink',
        line: true,
        d: 'M1140 165V310M1110 205H1270M1170 665H1270V740M130 165H230M180 115V215',
      },
    ],
  },
  {
    id: 'methods-studio',
    name: 'Methods Studio',
    plates: [
      { tone: 'light', d: 'M280 180H890L610 820H170Z' },
      { tone: 'solid', d: 'M620 180H1120L840 820H340Z' },
      { tone: 'canvas', d: 'M585 440H1150L1115 520H550Z' },
      { tone: 'sand', d: 'M1020 280H1310L1075 820H785Z' },
      { tone: 'canvas', d: 'M1120 630H1300V820H1040Z' },
      {
        tone: 'light',
        line: true,
        d: 'M715 245H1010M700 275H995M685 305H980M500 700H790M485 730H775',
      },
      {
        tone: 'ink',
        line: true,
        d: 'M1360 180V820M1330 180H1390M1330 340H1375M1330 500H1390M1330 660H1375M1330 820H1390M170 115H390',
      },
    ],
  },
  {
    id: 'systems-field',
    name: 'Systems Field',
    plates: [
      {
        tone: 'light',
        d: 'M200 185H670V470H200ZM850 185H1170V355H850ZM1030 560H1340V805H1030Z',
      },
      {
        tone: 'solid',
        d: 'M200 515H515V815H200ZM560 185H790V815H560ZM835 400H1170V610H835Z',
      },
      { tone: 'sand', d: 'M835 655H985V815H835ZM1215 185H1340V355H1215Z' },
      { tone: 'canvas', d: 'M620 290H730V400H620ZM895 460H1110V500H895Z' },
      {
        tone: 'ink',
        line: true,
        d: 'M150 135H390M150 135V375M200 435H500M200 460H405M1100 710H1275M1100 735H1275M1100 760H1200M1215 425H1400V505M390 865H985',
      },
      {
        tone: 'light',
        line: true,
        d: 'M265 585H445M265 610H445M265 635H375M620 570V735M645 570V735M670 570V675',
      },
    ],
  },
  {
    id: 'inquiry-map',
    name: 'Inquiry Map',
    plates: [
      { tone: 'light', d: 'M200 195H680L760 350 650 505 420 540 350 790H200Z' },
      {
        tone: 'solid',
        d: 'M715 195H1165V355L1035 440 1085 615 870 815H405L460 580 690 540 810 350Z',
      },
      { tone: 'sand', d: 'M1205 355H1370V815H925L1130 630 1080 460Z' },
      { tone: 'canvas', d: 'M770 595 860 520 955 555 930 665 815 700Z' },
      {
        tone: 'ink',
        line: true,
        d: 'M140 135H240M190 85V185M1260 195H1370M1315 140V250M1280 870H1380M1330 820V920M260 275H505M260 300H445M1190 710H1290M1190 735H1290',
      },
      {
        tone: 'light',
        line: true,
        d: 'M875 260H1085M875 285H1085M875 310H1015M520 735H730M520 760H670',
      },
    ],
  },
  {
    id: 'synthesis-layers',
    name: 'Synthesis Layers',
    plates: [
      { tone: 'light', d: 'M180 345 1020 155 1330 605 490 795Z' },
      { tone: 'sand', d: 'M345 180 1240 345 1110 850 215 685Z', opacity: 0.85 },
      {
        tone: 'solid',
        d: 'M245 420 1110 225 1280 650 415 845Z',
        opacity: 0.92,
      },
      { tone: 'light', d: 'M620 335 740 308 910 733 790 760Z', opacity: 0.8 },
      { tone: 'canvas', d: 'M260 570 1295 337 1310 372 275 605Z' },
      {
        tone: 'ink',
        line: true,
        d: 'M150 180H250M200 130V230M1260 810H1380M1320 750V870M1060 125 1390 610M200 845 460 905',
      },
      {
        tone: 'light',
        line: true,
        d: 'M425 680 605 640M435 705 615 665M445 730 565 703M890 420 1090 375',
      },
    ],
  },
  {
    id: 'research-archive',
    name: 'Research Archive',
    plates: [
      { tone: 'light', d: 'M220 170H1175V760H220Z' },
      { tone: 'solid', d: 'M300 250H1295V830H300Z' },
      { tone: 'canvas', d: 'M355 305H965V775H355Z' },
      { tone: 'light', d: 'M400 350H710V600H400Z' },
      { tone: 'sand', d: 'M755 350H910V775H755Z' },
      { tone: 'solid', d: 'M400 350H710L400 600Z' },
      { tone: 'canvas', d: 'M1020 305H1240V490H1020ZM1020 535H1130V775H1020Z' },
      {
        tone: 'light',
        line: true,
        d: 'M1175 560H1240M1175 585H1240M1175 610H1240M1175 710H1240M1175 735H1240',
      },
      {
        tone: 'ink',
        line: true,
        d: 'M400 665H710M400 690H710M400 715H610M155 170V430M120 215H190M155 875H515M1370 250V830M1335 830H1405',
      },
    ],
  },
] as const satisfies readonly Scene[];

export function visualHash(seed: string): number {
  let hash = 2166136261;
  for (const c of seed.normalize('NFC'))
    hash = Math.imul(hash ^ c.codePointAt(0)!, 16777619);
  return hash >>> 0;
}
export function coverSceneIndex(seed: string): number {
  return visualHash(seed) % coverScenes.length;
}
