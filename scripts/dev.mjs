import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import electron from 'electron'

const server = await createServer({
  server: { port: 21999, strictPort: true },
})
await server.listen()
server.printUrls()

const child = spawn(electron, ['.'], { stdio: 'inherit', windowsHide: false })

const shutdown = async () => {
  await server.close()
  process.exit(0)
}

child.on('close', shutdown)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
