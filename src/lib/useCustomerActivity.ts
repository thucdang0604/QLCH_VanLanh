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
    phone,
    enabled = true,
    includeOrders = true,
    includeRepairs = true,
}: UseCustomerActivityOptions) {
    const normalizedPhone = normalizeCustomerPhone(phone);
    const canLoad = enabled && normalizedPhone.length >= 9;
    const [currentOrders, setCurrentOrders] = useState<Order[]>([]);
    const [legacyOrders, setLegacyOrders] = useState<Order[]>([]);
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [repairStatuses, setRepairStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [loadingRepairs, setLoadingRepairs] = useState(false);
    const [orderError, setOrderError] = useState('');
    const [repairError, setRepairError] = useState('');

    useEffect(() => {
        setCurrentOrders([]);
        setLegacyOrders([]);
        setOrderError('');
        if (!canLoad || !includeOrders) {
            setLoadingOrders(false);
            return;
        }

        setLoadingOrders(true);
        let currentLoaded = false;
        let legacyLoaded = false;
        const markLoaded = () => {
            if (currentLoaded && legacyLoaded) setLoadingOrders(false);
        };
        const handleError = () => {
            setOrderError('Không tải được lịch sử đơn hàng.');
            setLoadingOrders(false);
        };

        const unsubCurrent = onSnapshot(
            query(collection(db, 'orders'), where('customer_info.phone', '==', normalizedPhone)),
            snapshot => {
                currentLoaded = true;
                setCurrentOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Order)));
                markLoaded();
            },
            handleError,
        );
        const unsubLegacy = onSnapshot(
            query(collection(db, 'orders'), where('customer.phone', '==', normalizedPhone)),
            snapshot => {
                legacyLoaded = true;
                setLegacyOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Order)));
                markLoaded();
            },
            handleError,
        );

        return () => {
            unsubCurrent();
            unsubLegacy();
        };
    }, [canLoad, includeOrders, normalizedPhone]);

    useEffect(() => {
        setTickets([]);
        setRepairStatuses([]);
        setWarrantyStatuses([]);
        setRepairError('');
        if (!canLoad || !includeRepairs) {
            setLoadingRepairs(false);
            return;
        }

        setLoadingRepairs(true);
        let ticketsLoaded = false;
        let statusesLoaded = false;
        const markLoaded = () => {
            if (ticketsLoaded && statusesLoaded) setLoadingRepairs(false);
        };

        const unsubTickets = onSnapshot(
            query(collection(db, 'repairs'), where('customer.phone', '==', normalizedPhone)),
            snapshot => {
                ticketsLoaded = true;
                setTickets(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as RepairTicket)));
                markLoaded();
            },
            () => {
                setRepairError('Không tải được lịch sử sửa chữa.');
                setLoadingRepairs(false);
            },
        );
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
            unsubTickets();
            unsubStatuses();
        };
    }, [canLoad, includeRepairs, normalizedPhone]);

    const orders = useMemo(() => {
        const byId = new Map<string, Order>();
        [...currentOrders, ...legacyOrders].forEach(order => byId.set(order.id, order));
        return Array.from(byId.values())
            .map<CustomerOrderActivity>(order => ({
                id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                totalAmount: Number(order.total_amount || 0),
                source: order.source || 'web',
            }))
            .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
    }, [currentOrders, legacyOrders]);

    const repairs = useMemo(() => tickets.map<CustomerRepairActivity>(ticket => {
        const status = getRepairStatus(ticket, repairStatuses, warrantyStatuses);
        return {
            id: ticket.id,
            status: ticket.status,
            statusLabel: status.label,
            createdAt: ticket.timing?.receivedAt,
            deviceModel: ticket.deviceInfo?.model || 'Thiết bị',
            amount: Number(ticket.payment?.amount || 0),
            ticketType: ticket.ticketType || 'repair',
            isTerminal: status.isTerminal,
        };
    }).sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt)), [
        repairStatuses,
        tickets,
        warrantyStatuses,
    ]);

    return {
        normalizedPhone,
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
