import { GAME_MINUTES, MOVE_SECONDS, type RoomSettings } from '../../../shared/presets.ts';
import type { Visibility } from '../../../shared/protocol.ts';
import { Segmented, Switch } from './ui/controls.tsx';

export function SettingsEditor({
  settings,
  visibility,
  onChange,
  disabled,
}: {
  settings: RoomSettings;
  visibility: Visibility;
  onChange: (settings: Partial<RoomSettings>, visibility?: Visibility) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-body font-medium">Who can join</p>
        <Segmented
          label="Who can join"
          value={visibility}
          disabled={disabled}
          onChange={(v) => onChange({}, v)}
          options={[
            { value: 'private', label: 'Invite only' },
            { value: 'public', label: 'Listed in lobby' },
          ]}
        />
      </div>
      <div>
        <p className="mb-2 text-body font-medium">Game clock</p>
        <Segmented
          label="Game clock"
          value={settings.gameMinutes}
          disabled={disabled}
          onChange={(v) => onChange({ gameMinutes: v })}
          options={GAME_MINUTES.map((m) => ({ value: m, label: m ? `${m} min` : 'None' }))}
        />
      </div>
      <div>
        <p className="mb-2 text-body font-medium">Time per move</p>
        <Segmented
          label="Time per move"
          value={settings.moveSeconds}
          disabled={disabled}
          onChange={(v) => onChange({ moveSeconds: v })}
          options={MOVE_SECONDS.map((s) => ({ value: s, label: s ? `${s} s` : 'None' }))}
        />
      </div>
      <div>
        <p className="mb-2 text-body font-medium">Host plays</p>
        <Segmented
          label="Host plays"
          value={settings.hostSide}
          disabled={disabled}
          onChange={(v) => onChange({ hostSide: v })}
          options={[
            { value: 'red', label: 'Red' },
            { value: 'blue', label: 'Blue' },
            { value: 'random', label: 'Random' },
          ]}
        />
      </div>
      <div className="flex flex-col">
        <Switch checked={settings.rated} disabled={disabled} onChange={(v) => onChange({ rated: v })} label="Rated" description="The result changes both players' ratings." />
        <Switch
          checked={settings.allowSpectators}
          disabled={disabled}
          onChange={(v) => onChange({ allowSpectators: v })}
          label="Allow spectators"
          description="Others can watch with the code or from Watch."
        />
        <Switch
          checked={settings.maxCapture}
          disabled={disabled}
          onChange={(v) => onChange({ maxCapture: v })}
          label="Take the most chips"
          description="Tournament rule: you must choose the capture sequence that takes the most chips."
        />
      </div>
    </div>
  );
}
