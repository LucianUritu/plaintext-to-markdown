# Windows Installer

This folder contains the Inno Setup configuration for building a downloadable Windows setup file.

## Requirements

Install Inno Setup 6:

https://jrsoftware.org/isinfo.php

## Build

From the project root:

```powershell
npm run setup
```

This packages the Electron app and then creates:

```text
dist\installer\PlaintextToMarkdownSetup-0.1.0.exe
```

The app executable and setup installer use `assets\MUP_logo_1.ico`, generated from `assets\MUP_logo_1.png`.

If the app has already been packaged, you can rebuild only the installer:

```powershell
npm run setup:installer
```

Upload the generated setup `.exe` to your website, GitHub Releases, OneDrive, or another download host.

## Notes

Unsigned installers may show Windows SmartScreen or "Unknown Publisher" warnings. To remove those warnings for users, the installer should eventually be code signed with a Windows code signing certificate.
