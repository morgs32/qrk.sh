export const taskItemScript = [
  {
    kind: 'edit',
    taskId: 'task-1',
    row: 0,
    text: 'Send invoice',
    command: 'setTitle',
    field: 'title',
    value: 'Send invoice',
  },
  {
    kind: 'background',
    taskId: 'task-2',
    command: 'setAssignee',
    field: 'assignee',
    value: 'Alex',
  },
  {
    kind: 'edit',
    taskId: 'task-1',
    row: 1,
    text: '@Jordan',
    command: 'setAssignee',
    field: 'assignee',
    value: 'Jordan',
  },
  {
    kind: 'background',
    taskId: 'task-3',
    command: 'addComment',
    field: 'comments',
    value: 'Billing address confirmed for the invoice.',
  },
  {
    kind: 'background',
    taskId: 'task-2',
    command: 'setStatus',
    field: 'status',
    value: 'Done',
  },
  {
    kind: 'edit',
    taskId: 'task-1',
    row: 2,
    text: '1 comment',
    command: 'addComment',
    field: 'comments',
    value: 'Please include the purchase order number.',
  },
  {
    kind: 'background',
    taskId: 'task-4',
    command: 'setTitle',
    field: 'title',
    value: 'Review draft',
  },
  {
    kind: 'edit',
    taskId: 'task-1',
    row: 2,
    text: '2 comments',
    command: 'addComment',
    field: 'comments',
    value: 'Invoice approved and ready to send.',
  },
  {
    kind: 'background',
    taskId: 'task-3',
    command: 'setAssignee',
    field: 'assignee',
    value: 'Sam',
  },
  {
    kind: 'background',
    taskId: 'task-4',
    command: 'addComment',
    field: 'comments',
    value: 'Invoice draft attached for review.',
  },
  {
    kind: 'edit',
    taskId: 'task-1',
    row: 1,
    text: '@Leslie',
    command: 'setAssignee',
    field: 'assignee',
    value: 'Leslie',
  },
] as const;

export const typingDelay = 190;
export const stepDelay = 1100;
export const checkedDelay = 2400;
export const replayDelay = 1000;
