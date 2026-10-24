# 3D Scene & Template Protection Rule

- **Protected Files**:
  - `app/src/components/BrainScene.tsx`
  - `app/src/lib/skull.ts`
  - `app/src/lib/shaders.ts`
  - `app/src/lib/geometry.ts`
  - `app/src/data/outline.ts`
  - `mri/*`
- **Rule**: Do NOT edit, refactor, restyle, or modify the 3D animated brain scene, shaders, skull geometry, or WebGL point cloud unless the user explicitly asks to edit the 3D visualization itself.
- **Scope**: Apply UI adjustments to the side panels (`ChatPanel`, `MemoryPanel`, `AdminPanel`), header, modals, and responsive layout without altering the core 3D scene template.
