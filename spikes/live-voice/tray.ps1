# Phase 0 tray helper: a global push-to-talk hotkey for Nexus voice.
# Hold Ctrl+Alt+Space anywhere in Windows -> POST /hotkey/down, release -> /hotkey/up.
# The open Nexus tab gets these over SSE and starts/stops listening.
# No install: PowerShell 5.1 + inline C# (RegisterHotKey + a tray icon).
#   powershell -ExecutionPolicy Bypass -File spikes\live-voice\tray.ps1 [-Base http://127.0.0.1:5180]
param([string]$Base = 'http://127.0.0.1:5180')

Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public class NexusTray : Form {
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);

    const int WM_HOTKEY = 0x0312, HOTKEY_ID = 0x4E58;
    const uint MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_NOREPEAT = 0x4000, VK_SPACE = 0x20;

    readonly string baseUrl;
    readonly NotifyIcon icon;
    bool held;

    public NexusTray(string baseUrl) {
        this.baseUrl = baseUrl.TrimEnd('/');
        ShowInTaskbar = false;
        WindowState = FormWindowState.Minimized;
        Opacity = 0;
        icon = new NotifyIcon { Icon = SystemIcons.Information, Text = "Nexus voice — hold Ctrl+Alt+Space", Visible = true };
        var menu = new ContextMenuStrip();
        menu.Items.Add("Quit Nexus hotkey", null, (s, e) => Close());
        icon.ContextMenuStrip = menu;
    }

    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        if (!RegisterHotKey(Handle, HOTKEY_ID, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_SPACE))
            Console.WriteLine("HOTKEY_TAKEN Ctrl+Alt+Space is already used by another app");
        else
            Console.WriteLine("READY hold Ctrl+Alt+Space");
    }

    protected override void WndProc(ref Message m) {
        if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HOTKEY_ID && !held) {
            held = true;
            Post("down");
            // RegisterHotKey only reports the press; poll for the release.
            new Thread(() => {
                while ((GetAsyncKeyState((int)VK_SPACE) & 0x8000) != 0) Thread.Sleep(20);
                held = false;
                Post("up");
            }) { IsBackground = true }.Start();
        }
        base.WndProc(ref m);
    }

    void Post(string dir) {
        try {
            using (var wc = new WebClient()) wc.UploadString(baseUrl + "/hotkey/" + dir, "POST", "");
            Console.WriteLine("SENT " + dir);
        } catch (Exception ex) {
            Console.WriteLine("POST_FAILED " + dir + " " + ex.Message);
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e) {
        UnregisterHotKey(Handle, HOTKEY_ID);
        icon.Visible = false;
        base.OnFormClosed(e);
    }
}
'@

[System.Windows.Forms.Application]::Run((New-Object NexusTray $Base))
