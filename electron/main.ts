import path from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { registerIpc } from './ipc'

app.setAppUserModelId('com.qidonqi.launcher')
app.setName('Qidonqi')

const DEV_URL = 'http://localhost:21999'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    show: false,
    frame: false,
    thickFrame: true,
    backgroundColor: '#080A09',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (!app.isPackaged) {
    void loadDev(mainWindow)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function loadDev(win: BrowserWindow): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await win.loadURL(DEV_URL)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
