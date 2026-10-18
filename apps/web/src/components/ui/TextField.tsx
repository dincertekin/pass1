import { clsx } from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  /** Renders the value in the monospace font. Use for passwords and generated values. */
  mono?: boolean;
  /** Shown under the input, e.g. a strength meter or an error message. */
  hint?: ReactNode;
};

export function TextField({ label, mono, hint, className, ...props }: TextFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <InputFrame>
        <input id={id} className={inputClass(mono, className)} {...props} />
      </InputFrame>
      {hint}
    </div>
  );
}

/** A password input with a show/hide toggle. Always uses the monospace font so look-alike characters stay distinct. */
export function PasswordField({
  label,
  hint,
  className,
  actions,
  ...props
}: Omit<TextFieldProps, "type" | "mono"> & {
  /** Extra buttons inside the field, before the show/hide toggle (e.g. the generator). */
  actions?: ReactNode;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <InputFrame>
        <input id={id} type={visible ? "text" : "password"} className={inputClass(true, className)} {...props} />
        {actions}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="grid size-7 cursor-pointer place-items-center rounded-sm text-muted hover:bg-sunken hover:text-text"
        >
          <Icon size={16} />
        </button>
      </InputFrame>
      {hint}
    </div>
  );
}

export function TextAreaField({ label, className, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { label: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <textarea
        id={id}
        className={clsx(
          "min-h-24 resize-y rounded-md border border-border-strong bg-surface px-2.5 py-2 text-text outline-none placeholder:text-muted",
          "focus:border-accent focus:ring-3 focus:ring-accent-soft",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function InputFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className={clsx(
        "flex h-9 items-center rounded-md border border-border-strong bg-surface pr-1",
        "focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft",
      )}
    >
      {children}
    </div>
  );
}

function inputClass(mono: boolean | undefined, className: string | undefined) {
  return clsx(
    "h-full min-w-0 flex-1 bg-transparent px-2.5 text-text outline-none placeholder:text-muted",
    mono && "font-mono text-[13px]",
    className,
  );
}
