import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getMembers, addMember, updateMember, deleteMember, deleteAllData, getSetting, setSetting } from '@/database/operations';
import { Member, MemberTag, MEMBER_TAGS, CURRENCIES } from '@/utils/types';
import { exportBackup, importBackup } from '@/utils/backup';

export default function SettingsScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState<MemberTag>('roommate');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState<MemberTag>('roommate');
  const [currency, setCurrency] = useState('₹');

  const loadData = async () => {
    try {
      const [m, c] = await Promise.all([getMembers(), getSetting('currency')]);
      setMembers(m);
      if (c) setCurrency(c);
    } catch (e) {
      console.error('Failed to load members:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleAdd = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Enter a name');
      return;
    }
    try {
      await addMember(newName, newTag);
      setNewName('');
      loadData();
    } catch (e) {
      console.error('Failed to add member:', e);
      Alert.alert('Error', 'Failed to add member');
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    try {
      await updateMember(id, editName, editTag);
      setEditingId(null);
      setEditName('');
      loadData();
    } catch (e) {
      console.error('Failed to update member:', e);
    }
  };

  const handleDelete = (id: number, name: string) => {
    Alert.alert(
      'Remove Member',
      `Remove "${name}"? All their expenses and settlements will be removed too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(id);
              loadData();
            } catch (e) {
              console.error('Failed to delete member:', e);
            }
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete ALL members, expenses and payments. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllData();
              loadData();
            } catch (e) {
              console.error('Failed to clear data:', e);
            }
          },
        },
      ]
    );
  };

  const handleCurrency = (symbol: string) => {
    setCurrency(symbol);
    setSetting('currency', symbol).catch(e => {
      console.error('Failed to save currency:', e);
      Alert.alert('Error', 'Failed to save currency setting');
    });
  };

  const handleExport = () => {
    Alert.alert(
      'Export Backup',
      'Export all members, expenses, payments and settings to a file you can share or keep.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            try {
              await exportBackup();
            } catch (e) {
              console.error('Failed to export backup:', e);
              Alert.alert('Error', 'Failed to export backup');
            }
          },
        },
      ]
    );
  };

  const handleImport = () => {
    Alert.alert(
      'Import Backup',
      'Importing will REPLACE all current data with the selected backup file. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          style: 'destructive',
          onPress: async () => {
            try {
              await importBackup();
              await loadData();
              Alert.alert('Success', 'Backup imported!');
            } catch (e) {
              console.error('Failed to import backup:', e);
              Alert.alert('Error', 'Failed to import backup. Pick a valid DormSplit backup file.');
            }
          },
        },
      ]
    );
  };

  const getTagLabel = (tag: MemberTag) => {
    return MEMBER_TAGS.find(t => t.key === tag)?.label || 'Other';
  };

  const getTagEmoji = (tag: MemberTag) => {
    return MEMBER_TAGS.find(t => t.key === tag)?.emoji || '👤';
  };

  const renderTagPicker = (selectedTag: MemberTag, onSelect: (t: MemberTag) => void) => (
    <View style={styles.tagRow}>
      {MEMBER_TAGS.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[styles.tagChip, selectedTag === t.key && styles.tagChipActive]}
          onPress={() => onSelect(t.key)}
        >
          <Text style={styles.tagEmoji}>{t.emoji}</Text>
          <Text style={[styles.tagText, selectedTag === t.key && styles.tagTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: Member }) => (
    <View style={styles.memberCard}>
      <View style={[styles.avatar, { backgroundColor: item.color }]}>
        <Text style={styles.avatarText}>{item.name[0]}</Text>
      </View>
      {editingId === item.id ? (
        <View style={styles.editContainer}>
          <View style={styles.editNameRow}>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
            />
            <TouchableOpacity style={styles.checkBtn} onPress={() => handleUpdate(item.id)}>
              <Text style={styles.checkBtnText}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingId(null)}>
              <Text style={styles.cancelBtnText}>✗</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.editTagRow}>
            {renderTagPicker(editTag, setEditTag)}
          </View>
        </View>
      ) : (
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName}>{item.name}</Text>
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>{getTagEmoji(item.tag)} {getTagLabel(item.tag)}</Text>
            </View>
          </View>
          <View style={styles.memberActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { setEditingId(item.id); setEditName(item.name); setEditTag(item.tag || 'other'); }}
            >
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDelete(item.id, item.name)}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Members</Text>
      </View>

      {/* Add member */}      
      <View style={styles.addSection}>
        <Text style={styles.sectionLabel}>Add new member</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.addInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Enter name..."
            placeholderTextColor="#BBB"
            onSubmitEditing={handleAdd}
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.smallLabel}>Type</Text>
        {renderTagPicker(newTag, setNewTag)}
      </View>

      {/* Currency */}
      <View style={styles.addSection}>
        <Text style={styles.sectionLabel}>Currency</Text>
        <Text style={styles.smallLabel}>Shown across the whole app</Text>
        <View style={styles.tagRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity
              key={c.key}
              style={[styles.tagChip, currency === c.symbol && styles.tagChipActive]}
              onPress={() => handleCurrency(c.symbol)}
            >
              <Text style={[styles.tagText, { fontSize: 16 }, currency === c.symbol && styles.tagTextActive]}>
                {c.symbol}
              </Text>
              <Text style={[styles.tagText, currency === c.symbol && styles.tagTextActive]}>{c.key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Members list */}
      <Text style={styles.sectionLabel}>Your members</Text>
      {members.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No members yet. Add roommates or hostel friends above!</Text>
        </View>
      ) : (
        members.map(item => (
          <View key={item.id}>{renderItem({ item })}</View>
        ))
      )}

      {/* Backup & Restore */}
      <View style={styles.addSection}>
        <Text style={styles.sectionLabel}>Backup & Restore</Text>
        <Text style={styles.smallLabel}>Export all data to a file, or restore from one</Text>
        <View style={styles.backupRow}>
          <TouchableOpacity style={styles.backupBtn} onPress={handleExport}>
            <Text style={styles.backupBtnText}>📤 Export</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backupBtn} onPress={handleImport}>
            <Text style={styles.backupBtnText}>📥 Import</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Danger zone */}
      {members.length > 0 && (
        <View style={styles.dangerZone}>
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.dangerText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { paddingBottom: 30 },
  header: {
    backgroundColor: '#208AEF',
    paddingTop: 55,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  addSection: { padding: 16 },
  sectionLabel: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8, marginHorizontal: 16, marginTop: 16 },
  smallLabel: { fontSize: 12, color: '#888', marginTop: 12, marginBottom: 6 },
  nameRow: { flexDirection: 'row', gap: 10 },
  addInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333',
  },
  addBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 10,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  tagRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 5,
  },
  tagChipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  tagEmoji: { fontSize: 14 },
  tagText: { fontSize: 13, color: '#555' },
  tagTextActive: { color: '#fff' },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { fontSize: 16, fontWeight: '600', color: '#333' },
  tagBadge: {
    backgroundColor: '#EEF3FB',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagBadgeText: { fontSize: 11, color: '#208AEF', fontWeight: '600' },
  memberActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  actionBtn: {},
  editText: { fontSize: 13, color: '#208AEF' },
  deleteText: { fontSize: 13, color: '#E57373' },
  editContainer: { flex: 1, marginLeft: 12 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: '#333',
  },
  editTagRow: { marginTop: 8 },
  checkBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn: {
    backgroundColor: '#E57373',
    borderRadius: 6,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center' },
  dangerZone: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 16,
  },
  dangerText: { fontSize: 14, color: '#E57373' },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  backupBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  backupBtnText: { fontSize: 14, fontWeight: '600', color: '#208AEF' },
});
