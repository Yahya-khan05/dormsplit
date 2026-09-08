import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { getMembers, addExpense } from '@/database/operations';
import { Member, CATEGORIES } from '@/utils/types';
import { useCurrency } from '@/hooks/use-currency';
import { formatAmount } from '@/utils/money';

export default function AddExpenseScreen() {
  const currency = useCurrency();
  const [members, setMembers] = useState<Member[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidById, setPaidById] = useState<number | null>(null);
  const [paidFromFund, setPaidFromFund] = useState(true);
  const [category, setCategory] = useState('food');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({});

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const m = await getMembers();
          setMembers(m);
          if (m.length > 0) {
            setPaidById(prev => (prev != null && m.some(x => x.id === prev) ? prev : m[0].id));
            setSelectedMembers(m.map(mem => mem.id));
          }
        } catch (e) {
          console.error('Failed to load members:', e);
        }
      })();
    }, [])
  );

  const toggleMember = (id: number) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setCategory('food');
    setSplitType('equal');
    setCustomAmounts({});
    setPaidFromFund(true);
    setPaidById(null);
    if (members.length > 0) {
      setSelectedMembers(members.map(m => m.id));
    }
  };

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Enter a description');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Enter a valid amount');
      return;
    }
    if (!paidFromFund && !paidById) {
      Alert.alert('Error', 'Select who paid');
      return;
    }
    if (selectedMembers.length === 0) {
      Alert.alert('Error', 'Select at least one member to split with');
      return;
    }

    let splits: { member_id: number; amount_owed: number }[];

    if (splitType === 'equal') {
      const share = Math.round((numAmount / selectedMembers.length) * 100) / 100;
      splits = selectedMembers.map(id => ({ member_id: id, amount_owed: share }));
      // Give the last person the remainder so shares always sum to the exact total.
      const used = Math.round(share * (selectedMembers.length - 1) * 100) / 100;
      splits[splits.length - 1].amount_owed = Math.round((numAmount - used) * 100) / 100;
    } else {
      splits = [];
      let total = 0;
      for (const id of selectedMembers) {
        const val = parseFloat(customAmounts[id] || '0');
        if (isNaN(val) || val < 0) {
          Alert.alert('Error', `Enter valid amount for member`);
          return;
        }
        splits.push({ member_id: id, amount_owed: val });
        total += val;
      }
      if (Math.abs(total - numAmount) > 0.01) {
        Alert.alert('Error', `Custom amounts (${formatAmount(total, currency, 2)}) don't match total (${formatAmount(numAmount, currency, 2)})`);
        return;
      }
    }

    try {
      await addExpense(description, numAmount, paidFromFund ? null : paidById, category, splitType, splits);
      Alert.alert('Success', 'Expense added!', [{ text: 'OK', onPress: () => { resetForm(); router.navigate('/'); } }]);
    } catch (e) {
      console.error('Failed to save expense:', e);
      Alert.alert('Error', 'Failed to save expense');
    }
  };

  if (members.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No Members Yet</Text>
          <Text style={styles.emptyText}>Add roommates in the Settings tab first!</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.navigate('/settings')}>
            <Text style={styles.primaryBtnText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Add Expense</Text>
      </View>

      {/* Description */}
      <Text style={styles.label}>What was it for?</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Grocery shopping, Canteen dinner..."
        placeholderTextColor="#BBB"
      />

      {/* Amount */}
      <Text style={styles.label}>Amount ({currency})</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
        placeholderTextColor="#BBB"
      />

      {/* Category */}
      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.categoryChip, category === cat.key && styles.categoryChipActive]}
            onPress={() => setCategory(cat.key)}
          >
            <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
            <Text style={[styles.categoryLabel, category === cat.key && styles.categoryLabelActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Paid By */}
      <Text style={styles.label}>Who paid?</Text>
      <Text style={styles.splitHint}>
        {'Pick "Shared Fund" when the money comes out of your group\'s fund.'}
      </Text>
      <View style={styles.memberRow}>
        <TouchableOpacity
          style={[styles.memberChip, paidFromFund && styles.fundChipActive]}
          onPress={() => { setPaidFromFund(true); setPaidById(null); }}
        >
          <Text style={[styles.memberChipText, paidFromFund && styles.fundChipTextActive]}>🏦 Shared Fund</Text>
        </TouchableOpacity>
        {members.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[styles.memberChip, !paidFromFund && paidById === m.id && { backgroundColor: m.color, borderColor: m.color }]}
            onPress={() => { setPaidFromFund(false); setPaidById(m.id); }}
          >
            <Text style={[styles.memberChipText, !paidFromFund && paidById === m.id && { color: '#fff' }]}>{m.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Split Type */}
      <Text style={styles.label}>Split type</Text>
      <View style={styles.splitTypeRow}>
        <TouchableOpacity
          style={[styles.splitTypeBtn, splitType === 'equal' && styles.splitTypeActive]}
          onPress={() => setSplitType('equal')}
        >
          <Text style={[styles.splitTypeText, splitType === 'equal' && styles.splitTypeTextActive]}>Equal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.splitTypeBtn, splitType === 'custom' && styles.splitTypeActive]}
          onPress={() => setSplitType('custom')}
        >
          <Text style={[styles.splitTypeText, splitType === 'custom' && styles.splitTypeTextActive]}>Custom</Text>
        </TouchableOpacity>
      </View>

      {/* Select members to split with */}
      <Text style={styles.label}>Split with</Text>
      <Text style={styles.splitHint}>
        Split is recorded for all {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} — deselect to exclude someone.
      </Text>
      <View style={styles.memberRow}>
        {members.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[styles.memberChip, selectedMembers.includes(m.id) && { backgroundColor: m.color, borderColor: m.color }]}
            onPress={() => toggleMember(m.id)}
          >
            <Text style={[styles.memberChipText, selectedMembers.includes(m.id) && { color: '#fff' }]}>
              {selectedMembers.includes(m.id) ? '✓ ' : ''}{m.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom amounts */}
      {splitType === 'custom' && (
        <View style={styles.customSection}>
          {selectedMembers.map(id => {
            const member = members.find(m => m.id === id);
            return (
              <View key={id} style={styles.customRow}>
                <Text style={styles.customName}>{member?.name}</Text>
                <TextInput
                  style={styles.customInput}
                  value={customAmounts[id] || ''}
                  onChangeText={(t) => setCustomAmounts(prev => ({ ...prev, [id]: t }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  placeholderTextColor="#BBB"
                />
              </View>
            );
          })}
        </View>
      )}

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Add Expense</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    marginHorizontal: -16,
    backgroundColor: '#208AEF',
    paddingTop: 55,
    paddingBottom: 16,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333',
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 4,
  },
  categoryChipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  categoryEmoji: { fontSize: 14 },
  categoryLabel: { fontSize: 13, color: '#555' },
  categoryLabelActive: { color: '#fff' },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  memberChipText: { fontSize: 14, color: '#555' },
  splitHint: { fontSize: 12, color: '#999', marginTop: -2, marginBottom: 6 },
  fundChipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  fundChipTextActive: { color: '#fff', fontWeight: '600' },
  splitTypeRow: { flexDirection: 'row', gap: 10 },
  splitTypeBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  splitTypeActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  splitTypeText: { fontSize: 14, color: '#555' },
  splitTypeTextActive: { color: '#fff', fontWeight: '600' },
  customSection: { marginTop: 8, gap: 8 },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  customName: { fontSize: 14, color: '#333' },
  customInput: {
    width: 100,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: 'right',
    color: '#333',
  },
  saveBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
