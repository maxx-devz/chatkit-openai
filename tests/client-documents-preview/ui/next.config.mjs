import {fileURLToPath} from 'node:url';
const config={reactStrictMode:true,turbopack:{root:fileURLToPath(new URL('../../../',import.meta.url))},devIndicators:false};
export default config;
