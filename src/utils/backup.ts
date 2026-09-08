import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Platform } from 'react-native';
import { exportAllData, importAllData, BackupData } from '@/database/operations';

export async function exportBackup(): Promise<void> {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('No file directory available');

  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14);
  const uri = `${dir}dormsplit-backup-${stamp}.json`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });

  if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export DormSplit backup',
    });
  } else {
    Alert.alert('Backup exported', `Backup saved at:\n${uri}`);
  }
}

export async function importBackup(): Promise<void> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return;
  }

  const uri = result.assets[0].uri;
  const json = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  const parsed = JSON.parse(json) as BackupData;

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.members)) {
    throw new Error('Invalid backup file');
  }

  await importAllData(parsed);
}