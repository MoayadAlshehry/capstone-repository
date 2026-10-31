import{defineConfig}from'vitest/config';import base from'./vitest.config.ts';
export default defineConfig({...base,test:{...base.test,include:['tools/release/ai-runtime.test.ts','tools/release/demo-marker.test.tsx'],fileParallelism:false,maxWorkers:1}});
