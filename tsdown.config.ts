import type { UserConfig } from 'tsdown'

const host: UserConfig = {
  name: 'dsh-hindsight',
  entry: {
    index: 'src/index.ts',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: { neverBundle: true },
  sourcemap: true,
}

export default host