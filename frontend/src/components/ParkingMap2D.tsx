import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MapSpace, SpaceStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Top-down landscape site plan traced from the campus reference drawing (SVG units: 1800 x 1400). */

export const STATUS_META: Record<SpaceStatus, { label: string; fill: string; ink: string }> = {
  AVAILABLE: { label: 'Available', fill: 'var(--slot-available)', ink: '#ffffff' },
  OCCUPIED: { label: 'Occupied', fill: 'var(--slot-occupied)', ink: '#ffffff' },
  EVENT_RESERVED: { label: 'Reserved for Event', fill: 'var(--slot-event)', ink: '#ffffff' },
}
const SHORT_STATUS: Record<SpaceStatus, string> = { AVAILABLE: 'AVAILABLE', OCCUPIED: 'OCCUPIED', EVENT_RESERVED: 'EVENT' }

function Label({ x, y, children, size = 20, rotate, weight = 700, spacing = 1.5, color = 'var(--map-label)' }: { x: number; y: number; children: ReactNode; size?: number; rotate?: number; weight?: number; spacing?: number; color?: string }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} letterSpacing={spacing} fill={color} textAnchor="middle" dominantBaseline="middle" transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {children}
    </text>
  )
}

function Tree({ x, y, r = 22 }: { x: number; y: number; r?: number }) {
  return (
    <g aria-hidden>
      <circle cx={x} cy={y} r={r} fill="var(--map-tree)" />
      <circle cx={x - r * 0.28} cy={y - r * 0.25} r={r * 0.5} fill="var(--map-tree-light)" />
      <circle cx={x + r * 0.32} cy={y + r * 0.2} r={r * 0.38} fill="var(--map-tree-light)" />
    </g>
  )
}

function Chevron({ x, y, left }: { x: number; y: number; left?: boolean }) {
  return <path d={left ? `M${x + 10},${y - 16} L${x - 10},${y} L${x + 10},${y + 16}` : `M${x - 10},${y - 16} L${x + 10},${y} L${x - 10},${y + 16}`} fill="none" stroke="var(--map-lane)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
}

function SitePlan() {
  return (
    <g aria-hidden>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--map-lane)" />
        </marker>
      </defs>
      <rect width="1800" height="1400" fill="var(--map-ground)" />

      {/* Driving surface */}
      <path d="M75,1295 V190 H1670 V1138 L1560,1295 Z" fill="var(--map-asphalt)" />

      {/* Traffic flow: in through the entrance, around the driveway, out through the exit */}
      <path d="M150,1133 C250,1133 235,954 340,954 H1370 C1445,954 1442,880 1442,800 V600 C1442,510 1430,479 1370,479 H340 C235,479 250,335 160,335" fill="none" stroke="var(--map-lane)" strokeWidth={5} strokeDasharray="20 16" strokeLinecap="round" markerEnd="url(#flow-arrow)" />
      {[520, 800, 1080].map((x) => <Chevron key={`in${x}`} x={x} y={954} />)}
      {[520, 800, 1080].map((x) => <Chevron key={`out${x}`} x={x} y={479} left />)}
      <Label x={1510} y={1000} size={28} spacing={5}>DRIVEWAY</Label>

      {/* Perimeter wall and pedestrian entrance */}
      <path d="M42,1380 V1338 H75 V130" fill="none" stroke="var(--map-wall)" strokeWidth={7} strokeLinejoin="round" />
      <Label x={200} y={1364} size={15} spacing={1}>ENTRANCE FOR STUDENTS</Label>
      <path d="M96,1318 H128 M116,1306 L130,1318 L116,1330" fill="none" stroke="var(--map-label)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />

      {/* Gates */}
      <rect x={61} y={1025} width={28} height={215} rx={4} fill="var(--map-gate-in)" />
      <Label x={75} y={1133} size={15} rotate={-90} color="#ffffff">ENTRANCE GATE</Label>
      <rect x={61} y={255} width={28} height={160} rx={4} fill="var(--map-gate-out)" />
      <Label x={75} y={335} size={15} rotate={-90} color="#ffffff">EXIT GATE</Label>

      {/* Guard house */}
      <rect x={95} y={875} width={120} height={120} rx={4} fill="var(--map-building)" stroke="var(--map-wall)" strokeWidth={4} />
      <path d="M95,875 L215,995 M215,875 L95,995" stroke="var(--map-wall)" strokeWidth={2} opacity={0.45} />
      <Label x={155} y={1014} size={16}>GUARD HOUSE</Label>

      <Label x={162} y={647} size={16} rotate={-90} spacing={3}>MOTORCYCLE PARKING</Label>

      {/* Hallway (Main Building) along the bottom edge */}
      <rect x={330} y={1300} width={1232} height={92} fill="var(--map-building)" stroke="var(--map-wall)" strokeWidth={4} />
      <Label x={945} y={1347} size={26} spacing={4}>HALLWAY (MAIN BUILDING)</Label>

      {/* Lobby: between the Hallway and the Main Entrance */}
      <path d="M1562,1392 V1300 L1675,1138 V975 H1790 V1392 Z" fill="var(--map-building)" stroke="var(--map-wall)" strokeWidth={4} strokeLinejoin="round" />
      <Label x={1682} y={1255} size={30} spacing={8}>LOBBY</Label>

      {/* Main Entrance */}
      <rect x={1675} y={680} width={115} height={295} fill="var(--map-building)" stroke="var(--map-wall)" strokeWidth={4} />
      <rect x={1664} y={735} width={22} height={190} rx={4} fill="var(--map-door)" />
      <Label x={1724} y={828} size={17} rotate={-90} spacing={1}>MAIN ENTRANCE</Label>
      <Label x={1754} y={828} size={13} rotate={-90} weight={500} spacing={0.5}>Door to Lobby</Label>

      {/* Offices */}
      <path d="M1675,680 V250 H1640 V190 H1790 V680 Z" fill="var(--map-building)" stroke="var(--map-wall)" strokeWidth={4} strokeLinejoin="round" />
      <Label x={1732} y={440} size={32} rotate={-90} spacing={10}>OFFICES</Label>

      {/* Pedestrian walkway */}
      <rect x={75} y={134} width={1715} height={52} fill="var(--map-walk)" />
      <path d="M75,134 H1790 M75,186 H1790" stroke="var(--map-wall)" strokeWidth={3} />
      <line x1={90} y1={160} x2={1780} y2={160} stroke="var(--map-walk-line)" strokeWidth={22} strokeDasharray="10 22" />
      <rect x={640} y={142} width={470} height={36} rx={6} fill="var(--map-walk)" />
      <Label x={875} y={161} size={18} spacing={2}>PEDESTRIAN WALKWAY</Label>
      <path d="M628,148 L610,160 L628,172 M1122,148 L1140,160 L1122,172" fill="none" stroke="var(--map-label)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />

      {/* DFA Building */}
      <rect x={60} y={8} width={1730} height={118} fill="var(--map-building)" stroke="var(--map-wall)" strokeWidth={4} />
      <Label x={925} y={68} size={30} spacing={5}>DFA BUILDING / ROOMS</Label>

      {/* Row labels */}
      <Label x={880} y={1116} size={17} spacing={3}>CAR PARKING</Label>
      <Label x={840} y={814} size={17} spacing={3}>CAR PARKING</Label>
      <Label x={800} y={366} size={17} spacing={3}>CAR PARKING</Label>
      <Label x={1490} y={480} size={17} rotate={-90} spacing={3}>CAR PARKING</Label>

      {/* Trees */}
      <Tree x={268} y={716} r={17} />
      <Tree x={596} y={716} r={17} />
      <Tree x={754} y={716} r={17} />
      <Tree x={1070} y={716} r={17} />
      <Tree x={1486} y={755} r={17} />
    </g>
  )
}

function Slot({ space, selected, dimmed, flash, onClick }: { space: MapSpace; selected: boolean; dimmed: boolean; flash: boolean; onClick: (s: MapSpace) => void }) {
  const meta = STATUS_META[space.status]
  const x = space.map_x!, y = space.map_y!, w = space.map_w!, h = space.map_h!
  const moto = space.slot_type === 'MOTORCYCLE'
  const compact = Math.min(w, h) < 110
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(space)
    }
  }
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${moto ? 'Motorcycle' : 'Car'} slot ${space.slot_number}, ${meta.label}${space.is_mine ? ', your reservation' : ''}`}
      aria-pressed={selected}
      onClick={() => onClick(space)}
      onKeyDown={onKey}
      className={cn('map-slot cursor-pointer outline-none', flash && 'map-slot-flash')}
      opacity={dimmed ? 0.32 : 1}
    >
      <title>{`${space.slot_number} · ${meta.label} · ${space.category_display}`}</title>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} fill="transparent" />
      <rect className="map-slot-body" x={x} y={y} width={w} height={h} rx={moto ? 4 : 8} fill={meta.fill} stroke={selected || space.is_mine ? 'var(--map-selected)' : '#ffffff'} strokeWidth={selected || space.is_mine ? 6 : 2} />
      {moto ? (
        <text x={x + w / 2} y={y + h / 2} fontSize={15} fontWeight={800} fill={meta.ink} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none' }}>
          {space.category === 'STUDENT' ? 'S ' : ''}{space.slot_number.replace('MC-', '')}
        </text>
      ) : (
        <g style={{ pointerEvents: 'none' }} textAnchor="middle" fill={meta.ink}>
          <text x={x + w / 2} y={y + h / 2 - (compact ? 10 : 16)} fontSize={compact ? 24 : 30} fontWeight={800}>{space.slot_number}</text>
          <text x={x + w / 2} y={y + h / 2 + (compact ? 12 : 12)} fontSize={compact ? 12 : 15} fontWeight={700} letterSpacing={0.5}>{space.is_mine ? 'YOUR SLOT' : SHORT_STATUS[space.status]}</text>
          <text x={x + w / 2} y={y + h / 2 + (compact ? 30 : 34)} fontSize={compact ? 11 : 13} fontWeight={500} opacity={0.9}>{space.category === 'FACULTY' ? 'Faculty' : 'Student Assistant'}</text>
        </g>
      )}
    </g>
  )
}

export function MapLegend({ spaces }: { spaces?: MapSpace[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {(Object.keys(STATUS_META) as SpaceStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-sm" style={{ background: STATUS_META[s].fill }} />
          <span className="font-medium">{STATUS_META[s].label}</span>
          {spaces && <span className="text-muted-foreground tabular-nums">{spaces.filter((x) => x.status === s).length}</span>}
        </span>
      ))}
    </div>
  )
}

export default function ParkingMap2D({
  spaces,
  onSlotClick,
  selectedIds,
  isDimmed,
  flashSlots,
}: {
  spaces: MapSpace[]
  onSlotClick: (s: MapSpace) => void
  selectedIds?: Set<number>
  isDimmed?: (s: MapSpace) => boolean
  flashSlots?: Set<string>
}) {
  const [zoom, setZoom] = useState(1)
  const placed = spaces.filter((s) => s.map_x != null && s.map_y != null && s.map_w != null && s.map_h != null)
  const unplaced = spaces.filter((s) => !placed.includes(s))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MapLegend spaces={spaces} />
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.25))}><Minus /></Button>
          <span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}><Plus /></Button>
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw /></Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        <strong className="text-foreground font-semibold">S</strong> marks the 3 student assistant motorcycle spaces. All other spaces are for faculty.
        <span className="lg:hidden"> Swipe sideways to see the whole map.</span>
      </p>
      <div className={cn('overflow-auto rounded-lg border', zoom > 1 && 'max-h-[85vh]')}>
        <svg viewBox="0 0 1800 1400" role="group" aria-label="Top-down map of the campus parking area" className="block h-auto" style={{ width: `${zoom * 100}%`, minWidth: 960 * zoom }}>
          <SitePlan />
          {placed.map((s) => (
            <Slot key={s.id} space={s} selected={!!selectedIds?.has(s.id)} dimmed={!!isDimmed?.(s)} flash={!!flashSlots?.has(s.slot_number)} onClick={onSlotClick} />
          ))}
        </svg>
      </div>
      {unplaced.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium">Other parking slots (not placed on the map)</p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((s) => (
              <button key={s.id} type="button" onClick={() => onSlotClick(s)} className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: STATUS_META[s.status].fill, color: STATUS_META[s.status].ink }}>
                {s.slot_number}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
