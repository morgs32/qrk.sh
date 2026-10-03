import '@fontsource/space-mono/400.css';

import './TodoCommandCode.css';

const source = `type Todo = {
  id: string
  title: string
  done: boolean
}

type Command =
  | { type: "todo.added"; id: string; title: string }
  | { type: "todo.completed"; id: string }

const commands: Command[] = [
  { type: "todo.added", id: "1", title: "Plan the day" },
  { type: "todo.added", id: "2", title: "Review the docs" },
  { type: "todo.completed", id: "1" },
]

const todos = commands.reduce<Todo[]>((items, command) => {
  if (command.type === "todo.added") {
    return [...items, { id: command.id, title: command.title, done: false }]
  }

  return items.map(todo =>
    todo.id === command.id ? { ...todo, done: true } : todo
  )
}, [])`;

const tokens = /("[^"]*"|\b(?:type|const|return|if|false|true)\b|\b(?:Todo|Command)\b|\b(?:string|boolean)\b|\b(?:id|title|done)\b)/g;

function tokenKind(token: string) {
  if (token.startsWith('"')) return 'string';
  if (/^(type|const|return|if|false|true)$/.test(token)) return 'keyword';
  if (/^(Todo|Command)$/.test(token)) return 'type';
  if (/^(string|boolean)$/.test(token)) return 'primitive';
  return 'property';
}

export function TodoCommandCode() {
  return (
    <pre className="todo-command-code" aria-label="TypeScript command example">
      <code>
        {source.split(tokens).map((part, index) =>
          index % 2 === 1 ? (
            <span className={`todo-command-token--${tokenKind(part)}`} key={index}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </code>
    </pre>
  );
}
