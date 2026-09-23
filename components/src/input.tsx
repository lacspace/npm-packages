import { forwardRef } from "react";
import type {
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { classes, useControllable, useStableId, type Size } from "./util.js";

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Label text. */
  label?: ReactNode;
  /** Helper text under the control. Hidden while an error is showing. */
  hint?: ReactNode;
  /** Error text. Its presence is what marks the field invalid. */
  error?: ReactNode;
  /** Mark the label with a required asterisk. */
  required?: boolean;
  /** The id of the control being labelled. Generated when omitted. */
  htmlFor?: string;
}

/**
 * Label, control, hint and error in the right order with the right wiring.
 *
 * Pass the render-prop children and the ids for `aria-describedby` and
 * `aria-invalid` are handed to you already correct, which is the part most
 * hand-rolled forms get wrong.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
  ...rest
}: Omit<FieldProps, "children"> & {
  children?: ReactNode | ((props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode);
}): JSX.Element {
  const id = useStableId(htmlFor, "field");
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  return (
    <div {...rest} className={classes("lac-field", className)}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {typeof children === "function" ? children({ id, describedBy, invalid }) : children}
      {!invalid && hint && (
        <span className="lac lac-hint" id={hintId}>
          {hint}
        </span>
      )}
      {invalid && (
        <span className="lac lac-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { required, className, ...rest },
  ref,
) {
  return (
    <label
      {...rest}
      ref={ref}
      className={classes("lac-label", className)}
      data-required={required || undefined}
    />
  );
});

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: Size;
  /** Mark invalid. `Field` sets this for you when it has an error. */
  invalid?: boolean;
  /** Content pinned inside the left edge — a currency symbol or search icon. */
  startAdornment?: ReactNode;
  /** Content pinned inside the right edge — a unit or a clear button. */
  endAdornment?: ReactNode;
}

/**
 * A text input. Adornments are positioned over the field and the padding is
 * adjusted to match, so text never slides underneath the icon.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", invalid, startAdornment, endAdornment, className, style, ...rest },
  ref,
) {
  const field = (
    <input
      {...rest}
      ref={ref}
      className={classes("lac-input", className)}
      data-size={size}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      style={{
        ...(startAdornment ? { ["--lac-input-pad-left" as string]: "38px" } : null),
        ...(endAdornment ? { ["--lac-input-pad-right" as string]: "38px" } : null),
        ...style,
      }}
    />
  );

  if (!startAdornment && !endAdornment) return field;

  return (
    <span className="lac lac-input-wrap">
      {startAdornment && (
        <span className="lac-input-affix" data-side="start">
          {startAdornment}
        </span>
      )}
      {field}
      {endAdornment && (
        <span className="lac-input-affix" data-side="end">
          {endAdornment}
        </span>
      )}
    </span>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      {...rest}
      ref={ref}
      className={classes("lac-textarea", className)}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
    />
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: Size;
  invalid?: boolean;
  /** Options as data. Ignored when you pass `<option>` children yourself. */
  options?: SelectOption[];
  /** A non-selectable first option, e.g. "Choose a country". */
  placeholder?: string;
}

/**
 * A native select, styled. Native is deliberate: on a phone this opens the
 * platform picker, which beats any custom listbox for reliability and a11y.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid, options, placeholder, className, children, ...rest },
  ref,
) {
  return (
    <select
      {...rest}
      ref={ref}
      className={classes("lac-select", className)}
      data-size={size}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))
        : children}
    </select>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text beside the box. */
  label?: ReactNode;
  /** Neither checked nor unchecked — the "some children selected" state. */
  indeterminate?: boolean;
}

/**
 * A checkbox with its label. `indeterminate` is applied to the DOM node through
 * a ref callback, because it is a property and cannot be set as an attribute.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate = false, className, disabled, ...rest },
  ref,
) {
  const setNode = (node: HTMLInputElement | null): void => {
    if (node) node.indeterminate = indeterminate;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
  };

  return (
    <label className={classes("lac-check", className)} data-disabled={disabled || undefined}>
      <input {...rest} ref={setNode} type="checkbox" disabled={disabled} />
      {label && <span>{label}</span>}
    </label>
  );
});

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, disabled, ...rest },
  ref,
) {
  return (
    <label className={classes("lac-check", className)} data-disabled={disabled || undefined}>
      <input {...rest} ref={ref} type="radio" disabled={disabled} />
      {label && <span>{label}</span>}
    </label>
  );
});

export interface SwitchProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** Controlled state. */
  checked?: boolean;
  /** Starting state when uncontrolled. */
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  /** Accessible name when there is no visible label. */
  "aria-label"?: string;
}

/**
 * An on/off switch. It is a `role="switch"` button rather than a styled
 * checkbox, so the state is announced as on/off instead of checked/unchecked.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked = false, onChange, label, disabled, className, ...rest },
  ref,
) {
  const [on, setOn] = useControllable(checked, defaultChecked, onChange);

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => !disabled && setOn(!on)}
      className={classes("lac-switch", className)}
      data-checked={on || undefined}
      data-disabled={disabled || undefined}
      style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit" }}
    >
      <span className="lac-switch-track">
        <span className="lac-switch-thumb" />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
});
