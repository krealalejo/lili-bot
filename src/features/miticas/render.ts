import { ButtonStyle, ComponentType } from '../../discord/constants.ts';
import type { MessagePayload } from '../../discord/rest.ts';
import { demoName, isDemo } from './demo.ts';
import type { GroupResult, Role, Signup } from './group.ts';
import { CustomId } from './ids.ts';

const OPEN_COLOR = 0x5865f2;
const RESULT_COLOR = 0x57f287;
const CLOSED_COLOR = 0x4f545c;

const ROLE_EMOJI: Record<Role, string> = { tank: '🛡️', healer: '💚', dps: '⚔️' };
const ROLE_LABEL: Record<Role, string> = { tank: 'Tank', healer: 'Healer', dps: 'DPS' };

const mention = (id: string): string => (isDemo(id) ? demoName(id) : `<@${id}>`);

const listMentions = (ids: readonly string[]): string =>
  ids.length === 0 ? '—' : ids.map(mention).join('\n');

const listSignups = (participants: readonly Signup[]): string =>
  participants.length === 0
    ? '—'
    : participants
        .map((signup) => `${mention(signup.id)} ${signup.roles.map((role) => ROLE_EMOJI[role]).join(' ')}`)
        .join('\n');

const roleName = (role: Role): string => `${ROLE_EMOJI[role]} ${ROLE_LABEL[role]}`;

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
        button(CustomId.Tank, ROLE_LABEL.tank, ROLE_EMOJI.tank, ButtonStyle.Primary, disabled),
        button(CustomId.Healer, ROLE_LABEL.healer, ROLE_EMOJI.healer, ButtonStyle.Primary, disabled),
        button(CustomId.Dps, ROLE_LABEL.dps, ROLE_EMOJI.dps, ButtonStyle.Primary, disabled),
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        button(CustomId.Leave, 'Salir', '🚪', ButtonStyle.Secondary, disabled),
        button(CustomId.Close, 'Cerrar convocatoria', '🔒', ButtonStyle.Danger, disabled),
      ],
    },
  ];
}

export function signupMessage(args: {
  participants: readonly Signup[];
  note: string | null;
  closesAt: number;
  priority: ReadonlySet<string>;
}): MessagePayload {
  const { participants, note, closesAt, priority } = args;

  const fields: unknown[] = [
    { name: `Apuntados (${participants.length})`, value: listSignups(participants) },
    { name: 'Se cierra', value: `<t:${Math.floor(closesAt / 1000)}:R>` },
  ];

  if (priority.size > 0) {
    fields.push({
      name: 'Con prioridad (se quedaron fuera la ronda pasada)',
      value: listMentions([...priority]),
    });
  }

  return {
    embeds: [
      {
        color: OPEN_COLOR,
        title: '🗝️ Míticas abiertas',
        description: [
          'Pulsa los roles que puedes jugar, puedes marcar varios. Vuelve a pulsar uno para quitarlo.',
          'Grupo: 1 tank, 1 healer y 3 DPS. Si sobra gente, se sortea.',
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
  result: GroupResult;
  participants: readonly Signup[];
  priority: ReadonlySet<string>;
}): MessagePayload {
  const { result, participants, priority } = args;

  if (participants.length === 0) {
    return {
      embeds: [
        {
          color: CLOSED_COLOR,
          title: 'Convocatoria vacía',
          description: 'No se apuntó nadie, así que las prioridades se quedan como estaban.',
        },
      ],
    };
  }

  const lineup = result.seats
    .map((seat) => `${roleName(seat.role)} — ${seat.id === null ? '*falta*' : mention(seat.id)}`)
    .join('\n');
  const fields: unknown[] = [{ name: 'Grupo', value: lineup }];

  if (result.benched.length > 0) {
    fields.push({
      name: `Fuera esta vez (${result.benched.length})`,
      value: listMentions(result.benched),
    });
  }

  const seatedByPriority = result.playing.filter((id) => priority.has(id));
  if (seatedByPriority.length > 0) {
    fields.push({ name: 'Entraron por prioridad', value: listMentions(seatedByPriority) });
  }

  const description = [
    `Sois ${participants.length}.`,
    result.missing.length > 0
      ? `Faltan: ${result.missing.map(roleName).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    embeds: [
      {
        color: RESULT_COLOR,
        title:
          result.benched.length === 0 && result.missing.length === 0
            ? '✅ Grupo completo, jugáis todos'
            : result.missing.length > 0
              ? '⚠️ Grupo incompleto'
              : '🎲 Grupo sorteado',
        description,
        fields,
        ...(result.benched.length > 0
          ? { footer: { text: 'Los que se quedan fuera tienen prioridad en la próxima convocatoria.' } }
          : {}),
      },
    ],
  };
}
