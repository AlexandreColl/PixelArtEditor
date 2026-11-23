interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the main action of a dialog or bar; ghost: no frame, for controls inside a list row */
  variant?: 'default' | 'primary' | 'ghost'
  /** A square button holding only an icon */
  icon?: boolean
  size?: 'md' | 'sm' | 'xs'
}

/**
 * The editor's button. Its look lives in index.css (.btn), so hover, focus, disabled and
 * pressed (aria-pressed) states are the same everywhere.
 */
export default function Button({
  variant = 'default',
  icon,
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' && `btn-${variant}`,
    icon && 'btn-icon',
    size !== 'md' && `btn-${size}`,
    className,
  ]
  return <button type={type} className={classes.filter(Boolean).join(' ')} {...rest} />
}
