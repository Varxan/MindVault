const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
        WidthType, BorderStyle, ShadingType, HeadingLevel } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 22 }
      }
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 32, bold: true, font: "Arial", color: "1F4E78" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 28, bold: true, font: "Arial", color: "2E5C8A" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // Title
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("MindVault")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Feature Status & Project Roadmap", italics: true, size: 24 })]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Last Updated: February 2025", italics: true, size: 20, color: "666666" })],
        spacing: { after: 240 }
      }),

      // ===== COMPLETED FEATURES =====
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("✅ Completed Features")]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders, shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Feature", bold: true })] })]
              }),
              new TableCell({
                borders, shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Status", bold: true })] })]
              })
            ]
          }),
          // Features
          ...createFeatureRows([
            ["Link Management", "Add, delete, search, filter, organize"],
            ["Collections System", "Create collections, organize links by category"],
            ["Video/Image Media", "Process videos & images with ffmpeg extraction"],
            ["Dark/Light Mode", "Full theme toggle support"],
            ["View Modes", "Grid, List, Large view options"],
            ["PWA Installation", "Installable web app with manifest"],
            ["Telegram Integration", "Send links directly to Telegram bot"],
            ["AI Auto-Tagging", "Anthropic Claude Vision integration"],
            ["Multi-Provider AI", "Anthropic + OpenAI (GPT-4) support"],
            ["API Key Management", "Secure settings for API credentials"],
            ["Backup & Export", "Full data export as JSON"],
            ["Import Functionality", "Restore from backup files"],
            ["SQLite Database", "Persistent local data storage"],
            ["Electron App", "Native macOS application"],
            ["English UI", "Complete English localization"],
            ["Settings Panel", "Dedicated configuration modal"]
          ])
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      // ===== IN PROGRESS =====
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("🔄 In Progress")]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders, shading: { fill: "FFF4D5", type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Task", bold: true })] })]
              }),
              new TableCell({
                borders, shading: { fill: "FFF4D5", type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Details", bold: true })] })]
              })
            ]
          }),
          ...createFeatureRows([
            ["API Integration Testing", "Testing Anthropic + OpenAI + Telegram connections"]
          ])
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      // ===== PLANNED FEATURES =====
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("📋 Planned Features")]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders, shading: { fill: "E8F5E9", type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Feature", bold: true })] })]
              }),
              new TableCell({
                borders, shading: { fill: "E8F5E9", type: ShadingType.CLEAR },
                width: { size: 4680, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true })] })]
              })
            ]
          }),
          ...createFeatureRows([
            ["License Key System", "License validation & activation"],
            ["Mobile/Cross-Device Sync", "Sync between desktop & mobile via PWA"],
            ["Cloud Sync", "Automatic backup to cloud storage (iCloud, Dropbox, Google Drive)"],
            ["Performance Optimization", "Caching, database optimization, code splitting"],
            ["Bug Fixes & Edge Cases", "Polish & reliability"],
            ["Final DMG Build", "Optimized macOS distribution"],
            ["User Testing", "Beta testing & feedback collection"],
            ["Launch", "Public release"]
          ])
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      // ===== TECHNICAL STACK =====
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("🛠️ Technical Stack")]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 7020],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders, shading: { fill: "F3E5F5", type: ShadingType.CLEAR },
                width: { size: 2340, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Component", bold: true })] })]
              }),
              new TableCell({
                borders, shading: { fill: "F3E5F5", type: ShadingType.CLEAR },
                width: { size: 7020, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: "Technology", bold: true })] })]
              })
            ]
          }),
          ...createTechRows([
            ["Frontend", "Next.js 14, React, TailwindCSS"],
            ["Backend", "Node.js/Express, SQLite3"],
            ["Desktop", "Electron (macOS ARM64)"],
            ["AI Services", "Anthropic Claude Vision, OpenAI GPT-4"],
            ["Media", "ffmpeg, ffprobe (video processing)"],
            ["Database", "SQLite with WAL mode"],
            ["Package Manager", "npm"],
            ["Build Tools", "electron-builder, Next.js built-in compiler"]
          ])
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      // ===== SUMMARY STATS =====
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("📊 Project Statistics")]
      }),

      new Paragraph({
        children: [new TextRun({ text: "Completed: ", bold: true }), new TextRun("16/27 features (59%)")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "In Progress: ", bold: true }), new TextRun("1/27 features")]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Planned: ", bold: true }), new TextRun("10/27 features")]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: "Est. Completion: Q1 2025", bold: true, italics: true })]
      })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/wonderful-inspiring-euler/mnt/MindVault/MINDVAULT_STATUS.docx", buffer);
  console.log("✅ Document created: MINDVAULT_STATUS.docx");
});

function createFeatureRows(features) {
  return features.map(([name, desc]) => new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 4680, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun(name)] })]
      }),
      new TableCell({
        borders,
        width: { size: 4680, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun(desc)] })]
      })
    ]
  }));
}

function createTechRows(techs) {
  return techs.map(([component, tech]) => new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 2340, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: component, bold: true })] })]
      }),
      new TableCell({
        borders,
        width: { size: 7020, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun(tech)] })]
      })
    ]
  }));
}
