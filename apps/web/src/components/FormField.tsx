import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

interface FieldChrome {
  label: string;
  error?: string;
  hint?: string;
}

type FormFieldProps = FieldChrome & InputHTMLAttributes<HTMLInputElement>;
type TextareaFieldProps = FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>;

function describedBy(inputId: string, error?: string, hint?: string): string | undefined {
  const ids = [error ? `${inputId}-error` : null, !error && hint ? `${inputId}-hint` : null].filter(
    Boolean,
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function FormField({ label, error, hint, id, ...rest }: FormFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        {...rest}
      />
      {hint && !error ? (
        <p className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextareaField({ label, error, hint, id, ...rest }: TextareaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        {...rest}
      />
      {hint && !error ? (
        <p className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
