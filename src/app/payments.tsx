import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  getMembers, addSettlement, getSettlements, deleteSettlement, updateSettlement,
  getMemberPositions, getFundTotal, MemberPosition, SettlementWithNames,
} from '@/database/operations';
import { Member } from '@/utils/types';
import { useCurrency } from '@/hooks/use-currency';
import { formatAmount } from '@/utils/money';

type Mode = 'deposit' | 'withdraw' | 'transfer';

export default function BankScreen() {
  const currency = useCurrency();
  const [members, setMembers] = useState<Member[]>([]);
  const [positions, setPositions] = useState<MemberPosition[]>([]);
  const [settlements, setSettlements] = useState<SettlementWithNames[]>([]);
  const [fundTotal, setFundTotal] = useState(0);
  const [mode, setMode] = useState<Mode>('deposit');
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const membersRef = useRef<Member[]>([]);

  const applyDefaults = useCallback(() => {
    const m = membersRef.current;
    if (m.length === 0) return;
    setFromId(prev => (prev != null && m.some(x => x.id === prev) ? prev : m[0].id));
    setToId(prev => (prev != null && m.some(x => x.id === prev) ? prev : (m.length > 1 ? m[1].id : null)));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [m, s, p, ft] = await Promise.all([
        getMembers(), getSettlements(), getMemberPositions(), getFundTotal(),
      ]);
      membersRef.current = m;
      setMembers(m);
      setSettlements(s);
      setPositions(p);
      setFundTotal(ft);
      applyDefaults();
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }, [applyDefaults]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setAmount('');
    setNote('');
    setMode('deposit');
    applyDefaults();
  }, [applyDefaults]);

  const startEdit = (item: SettlementWithNames) => {
    const hasFrom = item.from_id != null;
    const hasTo = item.to_id != null;
    if (hasFrom && hasTo) setMode('transfer');
    else if (hasFrom) setMode('deposit');
    else setMode('withdraw');
    setEditingId(item.id);
    setFromId(item.from_id);
    setToId(item.to_id);
    setAmount(String(item.amount));
    setNote(item.note || '');
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Enter a valid amount');
      return;
    }
    if (mode === 'deposit') {
      if (fromId === null) {
        Alert.alert('Error', 'Select who is putting money into the fund');
        return;
      }
      try {
        await (editingId !== null
          ? updateSettlement(editingId, fromId, null, numAmount, note || 'Deposit')
          : addSettlement(fromId, null, numAmount, note || 'Deposit'));
      } catch (e) {
        console.error('Failed to save deposit:', e);
        Alert.alert('Error', 'Failed to save deposit');
        return;
      }
    } else if (mode === 'withdraw') {
      if (toId === null) {
        Alert.alert('Error', 'Select who is taking money out of the fund');
        return;
      }
      try {
        await (editingId !== null
          ? updateSettlement(editingId, null, toId, numAmount, note || 'Withdrawal')
          : addSettlement(null, toId, numAmount, note || 'Withdrawal'));
      } catch (e) {
        console.error('Failed to save withdrawal:', e);
        Alert.alert('Error', 'Failed to save withdrawal');
        return;
      }
    } else {
      if (fromId === null || toId === null) {
        Alert.alert('Error', 'Select both people');
        return;
      }
      if (fromId === toId) {
        Alert.alert('Error', 'Select two different people');
        return;
      }
      try {
        await (editingId !== null
          ? updateSettlement(editingId, fromId, toId, numAmount, note || 'Payment')
          : addSettlement(fromId, toId, numAmount, note || 'Payment'));
      } catch (e) {
        console.error('Failed to save payment:', e);
        Alert.alert('Error', 'Failed to save payment');
        return;
      }
    }
    Alert.alert('Success', 'Recorded!', [
      { text: 'OK', onPress: () => { resetForm(); loadData(); } }
    ]);
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete Record',
      'Delete this fund record? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSettlement(id);
              if (editingId === id) resetForm();
              loadData();
            } catch (e) {
              console.error('Failed to delete record:', e);
            }
          },
        },
      ]
    );
  };

  const describeRecord = (item: SettlementWithNames) => {
    const f = item.from_id != null ? item.from_name : null;
    const t = item.to_id != null ? item.to_name : null;
    if (f && t) return `${f} paid ${t}`;
    if (f) return { prefix: 'deposited into the fund', name: f };
    if (t) return { prefix: 'withdrew from the fund', name: t };
    return { prefix: '', name: '' };
  };

  if (members.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Fund</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💰</Text>
          <Text style={styles.emptyTitle}>No members yet</Text>
          <Text style={styles.emptyText}>Add roommates in the Members tab first, then build your shared fund.</Text>
        </View>
      </View>
    );
  }

  const renderPositionCard = (p: MemberPosition) => {
    const credit = p.net > 0.01;
    const owes = p.net < -0.01;
    return (
      <View key={p.member_id} style={styles.positionCard}>
        <View style={[styles.avatar, { backgroundColor: p.color }]}>
          <Text style={styles.avatarText}>{p.name[0]}</Text>
        </View>
        <View style={styles.positionInfo}>
          <Text style={styles.positionName}>{p.name}</Text>
          <Text style={styles.positionDetail}>
            {'Paid in '}{formatAmount(p.paid_in, currency)}{' · Spent '}{formatAmount(p.paid_for, currency)}{' · Share '}{formatAmount(p.share, currency)}
          </Text>
        </View>
        <View style={styles.positionRight}>
          <Text style={[styles.positionNet, credit ? styles.creditText : owes ? styles.debtText : styles.settledText]}>
            {credit ? `fund owes ${formatAmount(p.net, currency)}`
              : owes ? `owes fund ${formatAmount(-p.net, currency)}`
              : 'Settled ✓'}
          </Text>
        </View>
      </View>
    );
  };

  const renderPayment = ({ item }: { item: SettlementWithNames }) => {
    const desc = describeRecord(item);
    const isGroupAction = item.from_id == null || item.to_id == null;
    return (
      <TouchableOpacity
        style={[styles.paymentCard, editingId === item.id && styles.paymentCardEditing]}
        onPress={() => startEdit(item)}
        onLongPress={() => handleDelete(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentDesc}>{item.note || (isGroupAction ? 'Fund record' : 'Payment')}</Text>
          <Text style={styles.paymentPeople}>
            {isGroupAction
              ? (desc as { prefix: string; name: string }).name
              : (item.from_name)}
            {' '}
            {isGroupAction
              ? (desc as { prefix: string; name: string }).prefix
              : `paid ${item.to_name}`}
          </Text>
          <Text style={styles.paymentDate}>{item.date}</Text>
        </View>
        <View style={styles.paymentAmountCol}>
          <Text style={[styles.paymentAmount, item.to_id != null && item.from_id == null ? styles.withdrawAmt : null]}>
            {formatAmount(item.amount, currency)}
          </Text>
          <Text style={styles.paymentEditHint}>{editingId === item.id ? 'Editing…' : 'Tap to edit'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fund</Text>
        <Text style={styles.headerSubtitle}>{'Your group\'s shared money'}</Text>
      </View>

      {/* Fund total */}
      <View style={styles.fundTotalCard}>
        <Text style={styles.fundTotalLabel}>{'CASH IN THE FUND'}</Text>
        <Text style={styles.fundTotalValue}>{formatAmount(fundTotal, currency)}</Text>
        <Text style={styles.fundTotalHint}>{'What everyone has put in, minus what has been taken out'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account positions */}
        <Text style={styles.label}>{'Who the fund owes'}</Text>
        {positions.length === 0 ? (
          <View style={styles.noHistory}>
            <Text style={styles.noHistoryText}>{'No members yet.'}</Text>
          </View>
        ) : (
          positions.map(renderPositionCard)
        )}

        {/* Mode switch */}
        <Text style={styles.label}>
          {editingId !== null ? 'Edit record' : 'Record money movement'}
        </Text>
        <View style={styles.modeRow}>
          {([
            { key: 'deposit', label: '💰 Deposit' },
            { key: 'withdraw', label: '💸 Withdraw' },
            { key: 'transfer', label: '🔄 Transfer' },
          ] as { key: Mode; label: string }[]).map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
              onPress={() => setMode(m.key)}
            >
              <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {(mode === 'deposit' || mode === 'transfer') && (
          <>
            <Text style={styles.smallLabel}>
              {mode === 'deposit'
                ? 'Who put money INTO the fund?'
                : 'Who paid? (money out of their pocket)'}
            </Text>
            <View style={styles.memberRow}>
              {members.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberChip, fromId === m.id && { backgroundColor: m.color, borderColor: m.color }]}
                  onPress={() => setFromId(m.id)}
                >
                  <Text style={[styles.memberChipText, fromId === m.id && { color: '#fff' }]}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {(mode === 'withdraw' || mode === 'transfer') && (
          <>
            <Text style={styles.smallLabel}>
              {mode === 'withdraw'
                ? 'Who took money OUT of the fund?'
                : 'Who received the cash?'}
            </Text>
            <View style={styles.memberRow}>
              {members.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberChip, toId === m.id && { backgroundColor: m.color, borderColor: m.color }]}
                  onPress={() => setToId(m.id)}
                >
                  <Text style={[styles.memberChipText, toId === m.id && { color: '#fff' }]}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.smallLabel}>
          {`Amount (${currency})`}
        </Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          placeholderTextColor="#BBB"
        />

        <Text style={styles.smallLabel}>{'Note (optional)'}</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Rent for the week, Grocery share..."
          placeholderTextColor="#BBB"
        />

        <View style={styles.saveRow}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>
              {editingId !== null ? 'Update' : mode === 'deposit' ? 'Deposit' : mode === 'withdraw' ? 'Withdraw' : 'Record Transfer'}
            </Text>
          </TouchableOpacity>
          {editingId !== null && (
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* History */}
        <Text style={styles.historyTitle}>{'History'}</Text>
        {settlements.length === 0 ? (
          <View style={styles.noHistory}>
            <Text style={styles.noHistoryText}>
              {'No fund records yet. Tap a record to edit it, hold to delete.'}
            </Text>
          </View>
        ) : (
          settlements.map(item => (
            <View key={item.id}>{renderPayment({ item })}</View>
          ))
        )}

        {/* How it works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howItWorksTitle}>{'How the fund works'}</Text>
          <Text style={styles.howItWorksText}>
            {'Your group shares one fund. Everyone adds cash into it — A adds 3000, B adds 1000, C adds 0 → the fund holds 4000.\n\n'}
            {'When someone pays a bill for the group (say 300 for food), they are credited their full payment and every member\'s share is debited equally (100 each). The fund tracks who is owed money and who still owes it.\n\n'}
            {'Deposit = money going INTO the fund (that person\'s balance goes up). Withdraw = money taken OUT (balance goes down). "Fund owes A 2900" means the group still owes A that much; "B owes fund 900" means B must top up.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: '#208AEF',
    paddingTop: 55,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#D6E9FF', marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },
  fundTotalCard: {
    backgroundColor: '#208AEF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  fundTotalLabel: { fontSize: 11, color: '#D6E9FF', fontWeight: '700', letterSpacing: 1 },
  fundTotalValue: { fontSize: 30, fontWeight: 'bold', color: '#fff', marginTop: 4 },
  fundTotalHint: { fontSize: 11, color: '#D6E9FF', marginTop: 6, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 16, marginBottom: 8 },
  smallLabel: { fontSize: 12, color: '#888', marginTop: 14, marginBottom: 6 },
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
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  modeBtnActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  modeBtnText: { fontSize: 13, color: '#555' },
  modeBtnTextActive: { color: '#fff', fontWeight: '600' },
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
  saveRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancelBtn: {
    backgroundColor: '#E57373',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  historyTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 24, marginBottom: 10 },
  noHistory: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  noHistoryText: { fontSize: 13, color: '#999', textAlign: 'center' },
  positionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
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
  positionInfo: { flex: 1, marginLeft: 12 },
  positionName: { fontSize: 15, fontWeight: '600', color: '#333' },
  positionDetail: { fontSize: 11, color: '#999', marginTop: 2 },
  positionRight: { marginLeft: 12 },
  positionNet: { fontSize: 15, fontWeight: 'bold' },
  creditText: { color: '#4CAF50' },
  debtText: { color: '#E65100' },
  settledText: { color: '#999' },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  paymentCardEditing: { borderWidth: 2, borderColor: '#208AEF' },
  paymentInfo: { flex: 1 },
  paymentDesc: { fontSize: 15, fontWeight: '600', color: '#333' },
  paymentPeople: { fontSize: 12, color: '#888', marginTop: 2 },
  paymentDate: { fontSize: 11, color: '#BBB', marginTop: 2 },
  paymentAmountCol: { marginLeft: 12, alignItems: 'flex-end' },
  paymentAmount: { fontSize: 18, fontWeight: 'bold', color: '#4CAF50' },
  withdrawAmt: { color: '#E65100' },
  paymentEditHint: { fontSize: 10, color: '#BBB', marginTop: 2 },
  howItWorks: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  howItWorksTitle: { fontSize: 14, fontWeight: 'bold', color: '#8D6E63', marginBottom: 6 },
  howItWorksText: { fontSize: 13, color: '#8D6E63', lineHeight: 19 },
  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
});