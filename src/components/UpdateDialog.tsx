import Dialog from './Dialog'
import type { UpdateStatus } from '../hooks/useUpdater'

interface UpdateDialogProps {
  status: Exclude<UpdateStatus, { phase: 'idle' }>
  onInstall: () => void
  onLater: () => void
}

/** The changelog's headings and bullets, enough to read it; anything else is shown as plain text. */
export function ReleaseNotes({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        // Inline code and bold lose their markers instead of showing them
        const plain = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
        if (/^#{1,6} /.test(line))
          return (
            <div key={i} style={{ marginTop: i ? 8 : 0, fontWeight: 600, color: '#e0e0e0' }}>
              {plain.replace(/^#+ /, '')}
            </div>
          )
        if (/^\s*[-*] /.test(line))
          return (
            <div key={i} style={{ display: 'flex', gap: 6, paddingLeft: 4 }}>
              <span>•</span>
              <span>{plain.replace(/^\s*[-*] /, '')}</span>
            </div>
          )
        return plain.trim() ? <div key={i}>{plain}</div> : null
      })}
    </>
  )
}

/** Offers a new version, with what changed, and shows the download while it installs. */
export default function UpdateDialog({ status, onInstall, onLater }: UpdateDialogProps) {
  const installing = status.phase === 'installing'
  return (
    <Dialog
      title={`Pixel Art Editor ${status.version} is available`}
      subtitle={`You have ${status.currentVersion}`}
      onConfirm={installing ? null : onInstall}
      onCancel={installing ? () => {} : onLater}
      confirmLabel={installing ? 'Installing…' : 'Install and restart'}
      cancelLabel="Later"
      cancelOnEscape={!installing}
      width={520}
    >
      {status.notes && (
        <div
          style={{
            maxHeight: 260,
            overflow: 'auto',
            padding: '8px 10px',
            borderRadius: 6,
            background: '#1e1e1e',
            color: '#ccc',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <ReleaseNotes text={status.notes} />
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 12, color: '#999' }}>
        {installing
          ? status.progress === null
            ? 'Downloading…'
            : `Downloading… ${Math.round(status.progress * 100)}%`
          : 'The editor restarts to finish. Unsaved work is kept and offered for recovery when it opens again.'}
      </div>
      {installing && status.progress !== null && (
        <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#333', overflow: 'hidden' }}>
          <div style={{ width: `${status.progress * 100}%`, height: '100%', background: '#4fc3f7' }} />
        </div>
      )}
    </Dialog>
  )
}
