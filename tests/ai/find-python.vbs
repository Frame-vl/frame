Option Explicit
On Error Resume Next

Dim service, processes, process
Set service = GetObject("winmgmts:\\.\root\cimv2")
If Err.Number <> 0 Then WScript.Quit 0
Set processes = service.ExecQuery("SELECT ExecutablePath FROM Win32_Process WHERE Name='python.exe' OR Name='pythonw.exe'")
If Err.Number <> 0 Then WScript.Quit 0

For Each process In processes
  If Not IsNull(process.ExecutablePath) Then
    If Len(Trim(CStr(process.ExecutablePath))) > 0 Then WScript.Echo CStr(process.ExecutablePath)
  End If
Next
