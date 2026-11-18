# Nexus global push-to-talk: hold Alt+Space anywhere in Windows to talk to Nexus.
# (Alt+Space since 2026-11-18: Ctrl+Alt+Space collided with the Claude desktop app's shortcut.
# While this runs, Alt+Space no longer opens Windows' window menu; quit it to get that back.)
# A tray icon; its only job is reporting the hotkey to the local Nexus server, which
# forwards it to the open Nexus tab. No install: PowerShell 5.1 + inline C#.
#
#   cd server; npm run hotkey          (or: powershell -ExecutionPolicy Bypass -File tools\hotkey\nexus-hotkey.ps1)
#
# Reads HOTKEY_SECRET from server/.env; the server only accepts presses from this
# machine that carry it (a press opens the microphone). Quit from the tray icon menu.
param([string]$Base = 'http://127.0.0.1:3001')

$envFile = Join-Path $PSScriptRoot '..\..\server\.env'
$secret = $null
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*HOTKEY_SECRET\s*=' } | Select-Object -First 1
  if ($line) { $secret = ($line -split '=', 2)[1].Trim().Trim('"') }
}
if (-not $secret) {
  Write-Host 'HOTKEY_SECRET is missing from server/.env. Add a long random value there and restart the server.'
  exit 1
}

Add-Type -WarningAction SilentlyContinue -ReferencedAssemblies System, System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Drawing;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public class NexusHotkey : Form {
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    const int WM_HOTKEY = 0x0312, HOTKEY_ID = 0x4E58;
    const uint MOD_ALT = 0x1, MOD_NOREPEAT = 0x4000, VK_SPACE = 0x20, KEYEVENTF_KEYUP = 0x2;
    const byte VK_MENU_MASK = 0xE8; // unassigned key: tells the app Alt was part of a combo
    const string LABEL = "Alt+Space";

    readonly string baseUrl;
    readonly string secret;
    readonly NotifyIcon icon;
    volatile bool held;
    // Presses go out in order on one background thread, so the key handler never waits on the network.
    readonly BlockingCollection<string> outbox = new BlockingCollection<string>();

    public NexusHotkey(string baseUrl, string secret) {
        this.baseUrl = baseUrl.TrimEnd('/');
        this.secret = secret;
        ShowInTaskbar = false;
        WindowState = FormWindowState.Minimized;
        Opacity = 0;
        icon = new NotifyIcon { Icon = SystemIcons.Information, Text = "Nexus voice: hold " + LABEL, Visible = true };
        var menu = new ContextMenuStrip();
        menu.Items.Add("Quit Nexus hotkey", null, (s, e) => Close());
        icon.ContextMenuStrip = menu;
        new Thread(() => { foreach (var dir in outbox.GetConsumingEnumerable()) Post(dir); }) { IsBackground = true }.Start();
    }

    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        if (!RegisterHotKey(Handle, HOTKEY_ID, MOD_ALT | MOD_NOREPEAT, VK_SPACE)) {
            // Usually PowerToys Run, the ChatGPT app or another launcher: free it there, then start this again.
            Console.WriteLine(LABEL + " is already taken by another app (PowerToys Run, ChatGPT, a launcher?). Free it there and start this again.");
            icon.ShowBalloonTip(4000, "Nexus hotkey", LABEL + " is taken by another app.", ToolTipIcon.Warning);
        } else {
            Console.WriteLine("Ready: hold " + LABEL + " anywhere to talk to Nexus. Quit from the tray icon.");
            // Windows 11 tucks new tray icons behind the ^ overflow, so announce that it's running.
            icon.ShowBalloonTip(4000, "Nexus hotkey is running", "Hold " + LABEL + " anywhere to talk. The icon is under the ^ on the taskbar.", ToolTipIcon.Info);
        }
    }

    protected override void WndProc(ref Message m) {
        if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HOTKEY_ID && !held) {
            held = true;
            // Without this, releasing Alt afterwards opens the menu bar of the app in front
            // (Chrome's menu, Office's ribbon keys): it only saw "Alt pressed and released".
            keybd_event(VK_MENU_MASK, 0, 0, UIntPtr.Zero);
            keybd_event(VK_MENU_MASK, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            outbox.Add("down");
            // RegisterHotKey reports only the press; poll for the release (starts at once).
            new Thread(() => {
                while ((GetAsyncKeyState((int)VK_SPACE) & 0x8000) != 0) Thread.Sleep(20);
                held = false;
                outbox.Add("up");
            }) { IsBackground = true }.Start();
        }
        base.WndProc(ref m);
    }

    void Post(string dir) {
        try {
            using (var wc = new WebClient()) {
                // Localhost needs no proxy; without this the first press waits ~600 ms on proxy auto-detection.
                wc.Proxy = null;
                wc.Headers.Add("x-nexus-hotkey", secret);
                wc.Headers.Add("content-type", "application/json");
                string reply = wc.UploadString(baseUrl + "/api/hotkey/" + dir, "POST", "{}");
                if (reply.Contains("\"delivered\":0")) Console.WriteLine(dir + ": no Nexus tab is open and signed in.");
            }
        } catch (Exception ex) {
            Console.WriteLine(dir + " failed: " + ex.Message + " (is the Nexus server running?)");
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e) {
        UnregisterHotKey(Handle, HOTKEY_ID);
        icon.Visible = false;
        base.OnFormClosed(e);
    }
}
'@

[System.Windows.Forms.Application]::Run((New-Object NexusHotkey $Base, $secret))
