import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import {
  getBalances, getTotalSpent, SimplifiedBalance,
  getMemberPositions, MemberPosition, getMembers, getFundTotal,
} from '@/database/operations';
import { Member } from '@/utils/types';
import { useCurrency } from '@/hooks/use-currency';
import { formatAmount } from '@/utils/money';

export default function HomeScreen() {
  const currency = useCurrency();
  const [balances, setBalances] = useState<SimplifiedBalance[]>([]);
  const [positions, setPositions] = useState<MemberPosition[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [fundTotal, setFundTotal] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [b, total, m, p, ft] = await Promise.all([
        getBalances(),
        getTotalSpent(),
        getMembers(),
        getMemberPositions(),
        getFundTotal(),
      ]);
      setBalances(b);
      setTotalSpent(total);
      setMembers(m);
      setPositions(p);
      setFundTotal(ft);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>DormSplit</Text>
        <Text style={styles.subtitle}>Split expenses with roommates</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatAmount(totalSpent, currency)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatAmount(fundTotal, currency)}</Text>
          <Text style={styles.statLabel}>In Fund</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{members.length}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
      </View>

      {/* Shared fund ledger */}
      {positions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Group Fund</Text>
          <Text style={styles.sectionSubtitle}>Who the fund owes, and who still owes the fund</Text>
          {positions.map(p => {
            const credit = p.net > 0.01;
            const owes = p.net < -0.01;
            return (
              <View key={p.member_id} style={styles.ledgerCard}>
                <View style={[styles.avatar, { backgroundColor: p.color }]}>
                  <Text style={styles.avatarText}>{p.name[0]}</Text>
                </View>
                <View style={styles.ledgerInfo}>
                  <Text style={styles.ledgerName}>{p.name}</Text>
                  <Text style={styles.ledgerDetail}>
                    Spent {formatAmount(p.paid_for, currency)} · Share {formatAmount(p.share, currency)} · Paid in {formatAmount(p.paid_in, currency)}
                  </Text>
                </View>
                <Text style={[styles.ledgerNet, credit ? styles.creditText : owes ? styles.debtText : styles.settledText]}>
                  {credit ? `fund owes ${formatAmount(p.net, currency)}`
                    : owes ? `owes fund ${formatAmount(-p.net, currency)}`
                    : 'Settled'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Balances */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Simplified Debts</Text>
        {members.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Add roommates in Settings tab first!
            </Text>
          </View>
        ) : balances.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              All settled up! No debts to show.
            </Text>
          </View>
        ) : (
          balances.map((b, i) => (
            <View key={i} style={styles.balanceCard}>
              <View style={styles.balanceLeft}>
                <View style={[styles.avatar, { backgroundColor: b.from_color }]}>
                  <Text style={styles.avatarText}>{b.from_name[0]}</Text>
                </View>
                <Text style={styles.balanceName}>{b.from_name}</Text>
              </View>
              <View style={styles.balanceCenter}>
                <Text style={styles.owesText}>owes</Text>
              </View>
              <View style={styles.balanceRight}>
                <Text style={styles.balanceName}>{b.to_name}</Text>
                <View style={[styles.avatar, { backgroundColor: b.to_color }]}>
                  <Text style={styles.avatarText}>{b.to_name[0]}</Text>
                </View>
              </View>
              <View style={styles.amountBadge}>
                <Text style={styles.amountText}>{formatAmount(b.amount, currency)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Record Payment button */}
      {members.length > 1 && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.payBtn} onPress={() => router.navigate('/payments')}>
            <Text style={styles.payBtnText}>💰  Manage the Fund</Text>
          </TouchableOpacity>
          <Text style={styles.payHint}>
            {'Record who put cash into your shared fund and who took it out, so everyone\'s balance stays correct.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  subtitle: { fontSize: 14, color: '#E0E0E0', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#208AEF' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, color: '#999', marginBottom: 12 },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    elevation: 1,
  },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center' },
  ledgerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  ledgerInfo: { flex: 1, marginLeft: 12 },
  ledgerName: { fontSize: 15, fontWeight: '600', color: '#333' },
  ledgerDetail: { fontSize: 11, color: '#999', marginTop: 2 },
  ledgerNet: { fontSize: 15, fontWeight: 'bold' },
  creditText: { color: '#4CAF50' },
  debtText: { color: '#E65100' },
  settledText: { color: '#999' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  balanceLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  balanceRight: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  balanceCenter: { paddingHorizontal: 8 },
  owesText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  balanceName: { fontSize: 14, fontWeight: '600', color: '#333', marginHorizontal: 6 },
  amountBadge: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  amountText: { fontSize: 13, fontWeight: 'bold', color: '#E65100' },
  payBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  payHint: { fontSize: 12, color: '#999', marginTop: 10, textAlign: 'center', lineHeight: 17 },
});