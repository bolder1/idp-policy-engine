import { createRequire } from 'node:module'
import * as stage from './stage.mjs'
import { SCENES, SUBS } from './script.mjs'
const V=decodeURIComponent(new URL('../../../../video', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const require=createRequire(`file:///${V.replace(/ /g,'%20')}/package.json`)
const {chromium}=require('playwright')
const b=await chromium.launch({channel:'chrome',headless:true})
const c=await b.newContext({viewport:{width:1920,height:1080}})
const p=await c.newPage()
await p.setContent(stage.html('about:blank'))
for (const k of ['where','story','order']) {
  await p.evaluate(([h,s])=>{window.__stage.scene(h); window.__stage.sub(s)}, [SCENES[k], SUBS.z2])
  await p.waitForTimeout(600)
  await p.screenshot({path:`rec/demo2/scene-${k}.png`})
}
await b.close(); console.log('ok')
