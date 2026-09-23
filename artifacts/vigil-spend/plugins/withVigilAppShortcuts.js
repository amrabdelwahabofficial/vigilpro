const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');

const SOURCE_FILE = 'VigilAppShortcuts.swift';

const SWIFT_SOURCE = `import AppIntents
import Foundation
import UIKit

@available(iOS 16.0, *)
struct VigilLogTransactionIntent: AppIntent {
  static let title: LocalizedStringResource = "Log Transaction"
  static let description = IntentDescription("Open Vigil's transaction form.")
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    guard let url = URL(string: "vigil-spend://capture") else {
      return .result()
    }

    await MainActor.run {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
    return .result()
  }
}

@available(iOS 16.0, *)
struct VigilAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: VigilLogTransactionIntent(),
      phrases: [
        "Log a transaction in \\(.applicationName)",
        "Open the transaction form in \\(.applicationName)"
      ],
      shortTitle: "Log Transaction",
      systemImageName: "plus.circle"
    )
  }
}
`;

function hasSourceFile(project, fileName) {
  return Object.values(project.pbxFileReferenceSection()).some(
    (file) => file && file.path === fileName,
  );
}

module.exports = function withVigilAppShortcuts(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const sourcePath = path.join(config.modRequest.platformProjectRoot, SOURCE_FILE);
    fs.writeFileSync(sourcePath, SWIFT_SOURCE);

    if (!hasSourceFile(project, SOURCE_FILE)) {
      const target = project.getFirstTarget();
      const group = project.findPBXGroupKey({ name: config.modRequest.projectName });
      project.addSourceFile(SOURCE_FILE, { target: target.uuid }, group);
    }

    return config;
  });
};