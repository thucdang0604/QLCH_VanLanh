'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FirestoreDateValue, Order, RepairTicket, WorkflowNode } from '@/lib/types';
import { normalizeRepairWorkflow, normalizeWarrantyWorkflow } from '@/lib/repairWorkflowConfig';

export interface CustomerOrderActivity {
    id: string;
    status: Order['status'];
    createdAt?: Date | FirestoreDateValue;
    totalAmount: number;
    source: 'web' | 'pos';
}

export interface CustomerRepairActivity {
    id: string;
    status: string;
    statusLabel: string;
    createdAt?: Date | FirestoreDateValue;
    deviceModel: string;
    amount: number;
    ticketType: 'repair' | 'warranty';
    isTerminal: boolean;
}

interface UseCustomerActivityOptions {
    customerId?: string;
    phone?: string;
    enabled?: boolean;
    includeOrders?: boolean;
    includeRepairs?: boolean;
}

const OPEN_ORDER_STATUSES = new Set<Order['status']>(['Pending', 'Confirmed', 'Shipping']);
const LEGACY_TERMINAL_REPAIR_STATUSES = new Set([
    'done',
    'out',
    'refund',
    'bh_hoan_tat',
    'bh_tu_choi',
    'bh_refund',
]);

export function normalizeCustomerPhone(value?: string): string {
    return String(value || '').replace(/[^0-9]/g, '');
}

export function isOpenOrderStatus(status: Order['status']): boolean {
    return OPEN_ORDER_STATUSES.has(status);
}

function toMillis(value?: Date | FirestoreDateValue): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const timestamp = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    return 0;
}

function getRepairStatus(
    ticket: RepairTicket,
    repairStatuses: WorkflowNode[],
    warrantyStatuses: WorkflowNode[],
): { label: string; isTerminal: boolean } {
    const workflow = ticket.ticketType === 'warranty' ? warrantyStatuses : repairStatuses;
    const node = workflow.find(item => item.id === ticket.status);
    return {
        label: node?.label || ticket.status,
        isTerminal: node?.isTerminal === true || LEGACY_TERMINAL_REPAIR_STATUSES.has(ticket.status),
    };
}

export function useCustomerActivity({
    customerId,
    phone,
    enabled = true,
    includeOrders = true,
    includeRepairs = true,
}: UseCustomerActivityOptions) {
    const normalizedPhone = normalizeCustomerPhone(phone);
    const stableCustomerId = String(customerId || '').trim();
    const shouldQueryPhone = enabled && normalizedPhone.length >= 9;
    const shouldQueryCustomerId = enabled && stableCustomerId.length > 0 && stableCustomerId !== normalizedPhone;
    const shouldQueryLegacyOrderPhone = shouldQueryPhone && !shouldQueryCustomerId;
    const canLoad = enabled && (shouldQueryPhone || shouldQueryCustomerId);

    const [currentOrders, setCurrentOrders] = useState<Order[]>([]);
    const [legacyOrders, setLegacyOrders] = useState<Order[]>([]);
    const [customerIdOrders, setCustomerIdOrders] = useState<Order[]>([]);
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [customerIdTickets, setCustomerIdTickets] = useState<RepairTicket[]>([]);
    const [repairStatuses, setRepairStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [loadingRepairs, setLoadingRepairs] = useState(false);
    const [orderError, setOrderError] = useState('');
    const [repairError, setRepairError] = useState('');

    useEffect(() => {
        setCurrentOrders([]);
        setLegacyOrders([]);
        setCustomerIdOrders([]);
        setOrderError('');
        if (!canLoad || !includeOrders) {
            setLoadingOrders(false);
            return;
        }

        setLoadingOrders(true);
        let pendingLoads = (shouldQueryPhone ? 1 : 0) + (shouldQueryLegacyOrderPhone ? 1 : 0) + (shouldQueryCustomerId ? 1 : 0);
        const markLoaded = () => {
            pendingLoads -= 1;
            if (pendingLoads <= 0) setLoadingOrders(false);
        };
        const handleError = () => {
            setOrderError('Khong tai duoc lich su don hang.');
            setLoadingOrders(false);
        };

        const unsubs: Array<() => void> = [];
        if (shouldQueryPhone) {
            unsubs.push(onSnapshot(
                query(collection(db, 'orders'), where('customer_info.phone', '==', normalizedPhone)),
                snapshot => {
                    setCurrentOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Order)));
                    markLoaded();
                },
                handleError,
            ));
        }
        if (shouldQueryLegacyOrderPhone) {
            unsubs.push(onSnapshot(
                query(collection(db, 'orders'), where('customer.phone', '==', normalizedPhone)),
                snapshot => {
                    setLegacyOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Order)));
                    markLoaded();
                },
                handleError,
            ));
        }
        if (shouldQueryCustomerId) {
            unsubs.push(onSnapshot(
                query(collection(db, 'orders'), where('customer_info.customerId', '==', stableCustomerId)),
                snapshot => {
                    setCustomerIdOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Order)));
                    markLoaded();
                },
                handleError,
            ));
        }

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [canLoad, includeOrders, normalizedPhone, shouldQueryCustomerId, shouldQueryLegacyOrderPhone, shouldQueryPhone, stableCustomerId]);

    useEffect(() => {
        setTickets([]);
        setCustomerIdTickets([]);
        setRepairStatuses([]);
        setWarrantyStatuses([]);
        setRepairError('');
        if (!canLoad || !includeRepairs) {
            setLoadingRepairs(false);
            return;
        }

        setLoadingRepairs(true);
        let pendingTicketLoads = (shouldQueryPhone ? 1 : 0) + (shouldQueryCustomerId ? 1 : 0);
        let statusesLoaded = false;
        const markLoaded = () => {
            if (pendingTicketLoads <= 0 && statusesLoaded) setLoadingRepairs(false);
        };
        const markTicketLoaded = () => {
            pendingTicketLoads -= 1;
            markLoaded();
        };
        const handleRepairError = () => {
            setRepairError('Khong tai duoc lich su sua chua.');
            setLoadingRepairs(false);
        };

        const unsubs: Array<() => void> = [];
        if (shouldQueryPhone) {
            unsubs.push(onSnapshot(
                query(collection(db, 'repairs'), where('customer.phone', '==', normalizedPhone)),
                snapshot => {
                    setTickets(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as RepairTicket)));
                    markTicketLoaded();
                },
                handleRepairError,
            ));
        }
        if (shouldQueryCustomerId) {
            unsubs.push(onSnapshot(
                query(collection(db, 'repairs'), where('customer.id', '==', stableCustomerId)),
                snapshot => {
                    setCustomerIdTickets(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as RepairTicket)));
                    markTicketLoaded();
                },
                handleRepairError,
            ));
        }
        const unsubStatuses = onSnapshot(doc(db, 'system_config', 'repairs'), snapshot => {
            statusesLoaded = true;
            const data = snapshot.data();
            setRepairStatuses(normalizeRepairWorkflow(data?.repairStatuses as WorkflowNode[] | undefined));
            setWarrantyStatuses(normalizeWarrantyWorkflow(data?.warrantyStatuses as WorkflowNode[] | undefined));
            markLoaded();
        }, () => {
            statusesLoaded = true;
            markLoaded();
        });

        return () => {
            unsubs.forEach(unsub => unsub());
            unsubStatuses();
        };
    }, [canLoad, includeRepairs, normalizedPhone, shouldQueryCustomerId, shouldQueryPhone, stableCustomerId]);

    const orders = useMemo(() => {
        const byId = new Map<string, Order>();
        [...customerIdOrders, ...currentOrders, ...legacyOrders].forEach(order => byId.set(order.id, order));
        return Array.from(byId.values())
            .map<CustomerOrderActivity>(order => ({
                id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                totalAmount: Number(order.total_amount || 0),
                source: order.source || 'web',
            }))
            .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
    }, [currentOrders, customerIdOrders, legacyOrders]);

    const repairs = useMemo(() => {
        const byId = new Map<string, RepairTicket>();
        [...customerIdTickets, ...tickets].forEach(ticket => byId.set(ticket.id, ticket));
        return Array.from(byId.values()).map<CustomerRepairActivity>(ticket => {
            const status = getRepairStatus(ticket, repairStatuses, warrantyStatuses);
            return {
                id: ticket.id,
                status: ticket.status,
                statusLabel: status.label,
                createdAt: ticket.timing?.receivedAt,
                deviceModel: ticket.deviceInfo?.model || 'Thiet bi',
                amount: Number(ticket.payment?.amount || 0),
                ticketType: ticket.ticketType || 'repair',
                isTerminal: status.isTerminal,
            };
        }).sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
    }, [
        customerIdTickets,
        repairStatuses,
        tickets,
        warrantyStatuses,
    ]);

    return {
        normalizedPhone,
        customerId: stableCustomerId,
        hasLinkedPhone: normalizedPhone.length >= 9,
        orders,
        repairs,
        openOrders: orders.filter(order => isOpenOrderStatus(order.status)),
        openRepairs: repairs.filter(repair => !repair.isTerminal),
        loadingOrders,
        loadingRepairs,
        orderError,
        repairError,
    };
}
