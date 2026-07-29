declare const Button: (props: {
  type: 'button';
  variant?: 'default' | 'outline';
  children: string;
}) => unknown;

/**
 * Default to the existing design-system component for standard interactive controls.
 *
 * @bad Do not hand-style a native `<button>` when the repository already provides a shadcn Button.
 * @bad Do not recreate design-system variants with one-off utility classes at the call site.
 */
export const viewDataButton = Button({
  type: 'button',
  children: 'View data',
});
