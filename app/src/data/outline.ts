import raw from '../../../mri/brain-outline.json';

/** Traced side-view MRI outline numbers (no scan data) plus the designed pathways. Shared with mri/brain-outline.json. */
export interface Station { x: number; y: number; side: 1 | -1; area: string }
export interface Tract { id: string; from: string; to: string; via: [number, number][]; name: string; kind: 'association' | 'projection' }
export interface Route { from: string; to: string; tracts: string[] }
export interface Region { cx: number; cy: number; rx: number; ry: number; label: string }
export interface Outline {
  w: number; h: number; hub: { x: number; y: number }; outline: string; folds: string[];
  regions: Record<'concept' | 'entity' | 'workstream', Region>;
  stations: Record<string, Station>; tracts: Tract[]; routes: Route[];
}
export const OUTLINE = raw as unknown as Outline;
