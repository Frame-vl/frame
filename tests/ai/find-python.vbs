Option Explicit
On Error Resume Next

Dim taskService, taskFolder, task, action
Set taskService = CreateObject("Schedule.Service")
taskService.Connect
If Err.Number = 0 Then
  Set taskFolder = taskService.GetFolder("\\")
  Set task = taskFolder.GetTask("FRAME AI Server")
  If Err.Number = 0 Then
    For Each action In task.Definition.Actions
      If Len(Trim(CStr(action.Path))) > 0 Then WScript.Echo CStr(action.Path)
    Next
  End If
End If
Err.Clear

Dim fileSystem, usersFolder, userFolder, candidate
Set fileSystem = CreateObject("Scripting.FileSystemObject")
If fileSystem.FolderExists("C:\Users") Then
  Set usersFolder = fileSystem.GetFolder("C:\Users")
  For Each userFolder In usersFolder.SubFolders
    candidate = userFolder.Path & "\AppData\Local\Programs\Python\Python312\python.exe"
    If fileSystem.FileExists(candidate) Then WScript.Echo candidate
    candidate = userFolder.Path & "\AppData\Local\Programs\Python\Python311\python.exe"
    If fileSystem.FileExists(candidate) Then WScript.Echo candidate
  Next
End If
Err.Clear

Dim service, processes, process
Set service = GetObject("winmgmts:\\.\root\cimv2")
If Err.Number = 0 Then
  Set processes = service.ExecQuery("SELECT ExecutablePath FROM Win32_Process WHERE Name='python.exe' OR Name='pythonw.exe'")
  If Err.Number = 0 Then
    For Each process In processes
      If Not IsNull(process.ExecutablePath) Then
        If Len(Trim(CStr(process.ExecutablePath))) > 0 Then WScript.Echo CStr(process.ExecutablePath)
      End If
    Next
  End If
End If
