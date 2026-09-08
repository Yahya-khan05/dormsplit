import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getExpenses, deleteExpense } from '@/database/operations';
import { ExpenseWithSplits, CATEGORIES } from '@/utils/types';
import { useCurrency } from '@/hooks/use-currency';
import { formatAmount } from '@/utils/money';

export default function HistoryScreen() {
  const currency = useCurrency();
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([]);

  const loadData = async () => {
    try {
      const data = await getExpenses();
      setExpenses(data);
    } catch (e) {
      console.error('Failed to load expenses:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleDelete = (id: number, desc: string) => {
    Alert.alert(
      'Delete Expense',
      `Delete "${desc}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(id);
              loadData();
            } catch (e) {
              console.error('Failed to delete:', e);
            }
          },
        },
      ]
    );
  };

  const getCategoryEmoji = (key: string) => {
    return CATEGORIES.find(c => c.key === key)?.emoji || '📦';
  };

  const renderItem = ({ item }: { item: ExpenseWithSplits }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onLongPress={() => handleDelete(item.id, item.description)}
      activeOpacity={0.7}
    >
      <View style={styles.expenseLeft}>
        <Text style={styles.emoji}>{getCategoryEmoji(item.category)}</Text>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseDesc}>{item.description}</Text>
          <Text style={styles.expensePaidBy}>
            {item.paid_by_name
              ? (
                <>
                  {'Paid by '}
                  <Text style={styles.paidByName}>{item.paid_by_name}</Text>
                </>
              )
              : 'Paid from the shared fund'}
          </Text>
          <View style={styles.splitsRow}>
            {item.splits.map((s, i) => (
              <Text key={i} style={styles.splitText}>
                {s.member_name}: {formatAmount(s.amount_owed, currency)}
              </Text>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.expenseRight}>
        <Text style={styles.expenseAmount}>{formatAmount(item.amount, currency)}</Text>
        <Text style={styles.expenseDate}>{item.date}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>
      {expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Expenses Yet</Text>
          <Text style={styles.emptyText}>Add your first expense in the Add tab!</Text>
        </View>
      ) : (
        <FlatList
          data={expenses}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.headerText}>
              {expenses.length} expense{expenses.length !== 1 ? 's' : ''} • Hold to delete
            </Text>
          }
        />
      )}
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
  list: { padding: 16, paddingBottom: 40 },
  headerText: { fontSize: 13, color: '#999', marginBottom: 12 },
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  expenseLeft: { flexDirection: 'row', flex: 1, alignItems: 'flex-start' },
  expenseRight: { alignItems: 'flex-end', marginLeft: 12 },
  emoji: { fontSize: 24, marginRight: 10, marginTop: 2 },
  expenseInfo: { flex: 1 },
  expenseDesc: { fontSize: 15, fontWeight: '600', color: '#333' },
  expensePaidBy: { fontSize: 12, color: '#888', marginTop: 2 },
  paidByName: { fontWeight: '600', color: '#555' },
  splitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  splitText: { fontSize: 11, color: '#888', backgroundColor: '#F0F0F0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  expenseAmount: { fontSize: 16, fontWeight: 'bold', color: '#208AEF' },
  expenseDate: { fontSize: 11, color: '#BBB', marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
});
