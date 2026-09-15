import { ButtonStyle, ComponentType } from '../../discord/constants.ts';
import type { MessagePayload } from '../../discord/rest.ts';
import { CustomId } from './ids.ts';
import { GROUP_SIZE, type RoundResult } from './rotation.ts';

const OPEN_COLOR = 0x5865f2;
const RESULT_COLOR = 0x57f287;
const CLOSED_COLOR = 0x4f545c;

const mention = (id: string): string => `<@${id}>`;

const listMentions = (ids: readonly string[]): string =>
  ids.length === 0 ? '—' : ids.map(mention).join('\n');

function button(customId: string, label: string, emoji: string, style: number, disabled: boolean) {
  return {
    type: ComponentType.Button,
    custom_id: customId,
    label,
    emoji: { name: emoji },
    style,
    disabled,
  };
}

function signupButtons(disabled: boolean) {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        button(CustomId.Join, 'Apuntarme', '✅', ButtonStyle.Success, disabled),
        button(CustomId.Leave, 'Salir', '🚪', ButtonStyle.Secondary, disabled),
        button(CustomId.Close, 'Cerrar convocatoria', '🔒', ButtonStyle.Danger, disabled),
      ],
    },
  ];
}

export function signupMessage(args: {
  participants: readonly string[];
  note: string | null;
  closesAt: number;
  immune: ReadonlySet<string>;
}): MessagePayload {
  const { participants, note, closesAt, immune } = args;

  const fields: unknown[] = [
    { name: `Apuntados (${participants.length})`, value: listMentions(participants) },
    { name: 'Se cierra', value: `<t:${Math.floor(closesAt / 1000)}:R>` },
  ];

  if (immune.size > 0) {
    fields.push({
      name: 'Con plaza asegurada (se quedaron fuera la ronda pasada)',
      value: listMentions([...immune]),
    });
  }

  return {
    embeds: [
      {
        color: OPEN_COLOR,
        title: '🎮 Convocatoria abierta',
        description: [
          'Pulsa **Apuntarme** para entrar en el sorteo.',
          `Caben ${GROUP_SIZE}. Si sois más, los que sobran se sortean.`,
          note ? `\n> ${note}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        fields,
      },
    ],
    components: signupButtons(false),
  };
}

export function closedMessage(participantCount: number, reason: string): MessagePayload {
  return {
    embeds: [
      {
        color: CLOSED_COLOR,
        title: '🔒 Convocatoria cerrada',
        description: `${reason} · ${participantCount} apuntado(s).`,
      },
    ],
    components: signupButtons(true),
  };
}

export function resultMessage(args: {
  result: RoundResult;
  participants: readonly string[];
  immune: ReadonlySet<string>;
}): MessagePayload {
  const { result, participants, immune } = args;

  if (participants.length === 0) {
    return {
      embeds: [
        {
          color: CLOSED_COLOR,
          title: 'Convocatoria vacía',
          description: 'No se apuntó nadie, así que la rotación se queda como estaba.',
        },
      ],
    };
  }

  if (result.benched.length === 0) {
    return {
      embeds: [
        {
          color: RESULT_COLOR,
          title: '✅ Jugáis todos, no hay rotación',
          description: `Sois ${participants.length}, caben ${GROUP_SIZE}.`,
          fields: [{ name: 'Equipo', value: listMentions(result.playing) }],
        },
      ],
    };
  }

  const seatedByImmunity = result.playing.filter((id) => immune.has(id));
  const fields: unknown[] = [
    { name: `Juegan (${result.playing.length})`, value: listMentions(result.playing) },
    { name: `Nominados (${result.benched.length})`, value: listMentions(result.benched) },
  ];

  if (seatedByImmunity.length > 0) {
    fields.push({ name: 'Entraron con plaza asegurada', value: listMentions(seatedByImmunity) });
  }

  return {
    embeds: [
      {
        color: RESULT_COLOR,
        title: '🎲 Rotación resuelta',
        description: `Sois ${participants.length} y caben ${GROUP_SIZE}: se quedan fuera ${result.benched.length}.`,
        fields,
        footer: { text: 'Los nominados tienen plaza asegurada en la próxima convocatoria.' },
      },
    ],
  };
}
