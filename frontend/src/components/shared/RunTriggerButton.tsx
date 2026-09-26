import { ReactNode, useState } from "react";

interface Props {
  label: string;
  title: string;
  children: (close: () => void) => ReactNode;
}

export default function RunTriggerButton({ label, title, children }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button className="primary-action compact" type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation">
          <section className="run-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="modal-heading">
              <h2>{title}</h2>
              <button className="icon-btn" type="button" onClick={close} aria-label="Close">
                x
              </button>
            </div>
            {children(close)}
          </section>
        </div>
      )}
    </>
  );
}
