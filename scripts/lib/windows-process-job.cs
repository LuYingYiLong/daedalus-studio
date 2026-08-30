using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

// The job handle is deliberately not inherited. Losing the supervisor closes
// the last handle, including when JS signal handlers cannot run.
public static class DaedalusProcessJob {
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo {
        public uint Size;
        public string Reserved, Desktop, Title;
        public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
        public ushort Show, ReservedBytes;
        public IntPtr ReservedData, Stdin, Stdout, Stderr;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    struct SecurityAttributes { public int Length; public IntPtr Descriptor; public int Inherit; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(SafeFileHandle job, int type, ref ExtendedLimits limits, int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(SafeFileHandle job, IntPtr process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcess(string executable, StringBuilder command, IntPtr processAttributes,
        IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string cwd,
        ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFile(string path, uint access, uint sharing,
        ref SecurityAttributes attributes, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    // Windows CRT argv quoting; no command shell or string evaluation.
    public static string Quote(string value) {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            result.Append(c);
            slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }

    public static int Run(string executable, string[] args, string cwd) {
        using (var job = CreateJobObject(IntPtr.Zero, null)) {
            if (job.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
            var limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(limits)))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)), Inherit = 1 };
            using (var input = CreateFile("NUL", 0x80000000, 3, ref attributes, 3, 0, IntPtr.Zero)) {
                if (input.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                var startup = new StartupInfo {
                    Size = (uint)Marshal.SizeOf(typeof(StartupInfo)), Flags = 0x100,
                    Stdin = input.DangerousGetHandle(), Stdout = GetStdHandle(-11), Stderr = GetStdHandle(-12)
                };
                if (!SetHandleInformation(startup.Stdout, 1, 1) || !SetHandleInformation(startup.Stderr, 1, 1))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                var command = new StringBuilder(Quote(executable));
                foreach (string arg in args) command.Append(' ').Append(Quote(arg));
                ProcessInfo child;
                // Enrol before any child code executes, avoiding a spawn/assignment race.
                if (!CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, 0x204,
                    IntPtr.Zero, cwd, ref startup, out child))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                try {
                    if (!AssignProcessToJobObject(job, child.Process) || ResumeThread(child.Thread) == 0xffffffff) {
                        int error = Marshal.GetLastWin32Error();
                        TerminateProcess(child.Process, 1);
                        throw new Win32Exception(error);
                    }
                    // stdin belongs only to the JS launcher; EOF also detects a hard-killed launcher.
                    var watchdog = new Thread(() => {
                        try { using (var parentInput = Console.OpenStandardInput()) { while (parentInput.ReadByte() != -1) {} } }
                        catch (System.IO.IOException) {}
                        job.Dispose();
                    });
                    watchdog.IsBackground = true;
                    watchdog.Start();
                    WaitForSingleObject(child.Process, 0xffffffff);
                    uint exitCode;
                    return GetExitCodeProcess(child.Process, out exitCode) ? unchecked((int)exitCode) : 1;
                } finally {
                    CloseHandle(child.Thread);
                    CloseHandle(child.Process);
                }
            }
        }
    }
}
