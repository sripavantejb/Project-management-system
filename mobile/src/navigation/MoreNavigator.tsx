import { useMemo } from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MoreMainScreen } from '../screens/more/MoreMainScreen'
import { AttendanceScreen } from '../screens/attendance/AttendanceScreen'
import { LeadsScreen } from '../screens/leads/LeadsScreen'
import { LeadDetailScreen } from '../screens/leads/LeadDetailScreen'
import { CreateLeadScreen } from '../screens/leads/CreateLeadScreen'
import { BoqListScreen } from '../screens/boq/BoqListScreen'
import { BoqDetailScreen } from '../screens/boq/BoqDetailScreen'
import { MeasurementSheetScreen } from '../screens/boq/MeasurementSheetScreen'
import { CreateBoqScreen } from '../screens/boq/CreateBoqScreen'
import { EditQuotationScreen } from '../screens/boq/EditQuotationScreen'
import { MaterialsHubScreen } from '../screens/procurement/MaterialsHubScreen'
import { RfqDetailScreen } from '../screens/procurement/RfqDetailScreen'
import { CreateRfqScreen } from '../screens/procurement/CreateRfqScreen'
import { RfqPanelScreen } from '../screens/procurement/RfqPanelScreen'
import { PurchaseOrderDetailScreen } from '../screens/procurement/PurchaseOrderDetailScreen'
import { GrnDetailScreen } from '../screens/procurement/GrnDetailScreen'
import { CreateGrnScreen } from '../screens/procurement/CreateGrnScreen'
import { CreateQcScreen } from '../screens/procurement/CreateQcScreen'
import { CreateMaterialRequestScreen } from '../screens/procurement/CreateMaterialRequestScreen'
import { CreateMaterialIssueScreen } from '../screens/procurement/CreateMaterialIssueScreen'
import { CreateVendorPaymentScreen } from '../screens/procurement/CreateVendorPaymentScreen'
import { VendorPaymentDetailScreen } from '../screens/procurement/VendorPaymentDetailScreen'
import { VendorDetailScreen } from '../screens/procurement/VendorDetailScreen'
import { EditVendorScreen } from '../screens/procurement/EditVendorScreen'
import { DocsScreen } from '../screens/docs/DocsScreen'
import { SiteSupervisorScreen } from '../screens/site/SiteSupervisorScreen'
import { VendorsScreen } from '../screens/procurement/VendorsScreen'
import { CreateVendorScreen } from '../screens/procurement/CreateVendorScreen'
import { PurchaseOrdersScreen } from '../screens/procurement/PurchaseOrdersScreen'
import { CreatePurchaseOrderScreen } from '../screens/procurement/CreatePurchaseOrderScreen'
import { FinanceScreen } from '../screens/finance/FinanceScreen'
import { CreateExpenseScreen } from '../screens/finance/CreateExpenseScreen'
import { SiteFeedScreen } from '../screens/sitefeed/SiteFeedScreen'
import { PostSiteUpdateScreen } from '../screens/sitefeed/PostSiteUpdateScreen'
import { SnagsScreen } from '../screens/sitefeed/SnagsScreen'
import { CreateSnagScreen } from '../screens/sitefeed/CreateSnagScreen'
import { ReportsScreen } from '../screens/reports/ReportsScreen'
import { PortfolioScreen } from '../screens/reports/PortfolioScreen'
import { LiveBoardScreen } from '../screens/live/LiveBoardScreen'
import { InventoryScreen } from '../screens/inventory/InventoryScreen'
import { CreateInventoryItemScreen } from '../screens/inventory/CreateInventoryItemScreen'
import { InventoryMovementsScreen } from '../screens/inventory/InventoryMovementsScreen'
import { CompanyAdminDashboardScreen } from '../screens/admin/CompanyAdminDashboardScreen'
import { PlatformNavigator } from './PlatformNavigator'
import { ImpactScreen } from '../screens/impact/ImpactScreen'
import { AdjustPointsScreen } from '../screens/impact/AdjustPointsScreen'
import { ImpactRuleScreen } from '../screens/impact/ImpactRuleScreen'
import { ImpactPersonScreen } from '../screens/impact/ImpactPersonScreen'
import { ProfileNavigator } from './ProfileNavigator'
import { BillingScreen } from '../screens/billing/BillingScreen'
import { InvoiceDetailScreen } from '../screens/billing/InvoiceDetailScreen'
import { CreateInvoiceScreen } from '../screens/billing/CreateInvoiceScreen'
import { ComposeEmailScreen } from '../screens/settings/ComposeEmailScreen'
import { TaxInvoicesScreen } from '../screens/billing/TaxInvoicesScreen'
import { TaxInvoiceDetailScreen } from '../screens/billing/TaxInvoiceDetailScreen'
import { EditTaxInvoiceScreen } from '../screens/billing/EditTaxInvoiceScreen'
import { NotificationsScreen } from '../screens/inbox/NotificationsScreen'
import { AssignedCommentsScreen } from '../screens/more/AssignedCommentsScreen'
import { ApprovalsScreen } from '../screens/approvals/ApprovalsScreen'
import { CreateApprovalRuleScreen } from '../screens/approvals/CreateApprovalRuleScreen'
import { CreateApprovalTypeScreen } from '../screens/approvals/CreateApprovalTypeScreen'
import { CustomFieldsScreen } from '../screens/more/CustomFieldsScreen'
import { TaskDetailScreen } from '../screens/tasks/TaskDetailScreen'
import { formSheetOptions, stackScreenOptions } from './options'
import { useColors } from '../theme/useColors'
import type { MoreStackParamList } from './types'

const Stack = createNativeStackNavigator<MoreStackParamList>()

export function MoreNavigator() {
  const colors = useColors()
  const options = useMemo(() => stackScreenOptions(colors), [colors])
  return (
    <Stack.Navigator screenOptions={options}>
      <Stack.Screen name="MoreMain" component={MoreMainScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ headerShown: false, title: 'Attendance' }} />

      <Stack.Screen name="Leads" component={LeadsScreen} options={{ headerShown: false, title: 'New enquiries' }} />
      <Stack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ headerShown: false, title: 'Enquiry' }} />
      <Stack.Screen name="CreateLead" component={CreateLeadScreen} options={formSheetOptions(colors, 'New enquiry')} />

      <Stack.Screen name="BoqList" component={BoqListScreen} options={{ headerShown: false, title: 'BOQ / Quotes' }} />
      <Stack.Screen name="BoqDetail" component={BoqDetailScreen} options={{ headerShown: false, title: 'Quotation' }} />
      <Stack.Screen name="BoqMeasurement" component={MeasurementSheetScreen} options={{ headerShown: false, title: 'Measurements' }} />
      <Stack.Screen name="CreateBoq" component={CreateBoqScreen} options={formSheetOptions(colors, 'New quotation')} />
      <Stack.Screen
        name="EditQuotation"
        component={EditQuotationScreen}
        options={formSheetOptions(colors, 'Edit quotation')}
      />

      <Stack.Screen name="MaterialsHub" component={MaterialsHubScreen} options={{ headerShown: false, title: 'Materials' }} />
      <Stack.Screen name="RfqPanel" component={RfqPanelScreen} options={{ headerShown: false, title: 'RFQs' }} />
      <Stack.Screen name="RfqDetail" component={RfqDetailScreen} options={{ headerShown: false, title: 'RFQ' }} />
      <Stack.Screen name="CreateRfq" component={CreateRfqScreen} options={formSheetOptions(colors, 'Raise RFQ')} />
      <Stack.Screen name="PurchaseOrderDetail" component={PurchaseOrderDetailScreen} options={{ headerShown: false, title: 'Purchase order' }} />

      <Stack.Screen name="GrnDetail" component={GrnDetailScreen} options={{ headerShown: false, title: 'GRN' }} />
      <Stack.Screen name="CreateGrn" component={CreateGrnScreen} options={formSheetOptions(colors, 'Record GRN')} />
      <Stack.Screen name="CreateQc" component={CreateQcScreen} options={formSheetOptions(colors, 'Quality check')} />
      <Stack.Screen
        name="CreateMaterialRequest"
        component={CreateMaterialRequestScreen}
        options={formSheetOptions(colors, 'Material request')}
      />
      <Stack.Screen
        name="CreateMaterialIssue"
        component={CreateMaterialIssueScreen}
        options={formSheetOptions(colors, 'Issue material')}
      />
      <Stack.Screen
        name="CreateVendorPayment"
        component={CreateVendorPaymentScreen}
        options={formSheetOptions(colors, 'Raise payment')}
      />
      <Stack.Screen
        name="VendorPaymentDetail"
        component={VendorPaymentDetailScreen}
        options={{ headerShown: false, title: 'Payment' }}
      />

      <Stack.Screen name="Vendors" component={VendorsScreen} options={{ headerShown: false, title: 'Vendors' }} />
      <Stack.Screen name="VendorDetail" component={VendorDetailScreen} options={{ headerShown: false, title: 'Vendor' }} />
      <Stack.Screen name="EditVendor" component={EditVendorScreen} options={formSheetOptions(colors, 'Edit vendor')} />
      <Stack.Screen name="CreateVendor" component={CreateVendorScreen} options={formSheetOptions(colors, 'New vendor')} />
      <Stack.Screen name="PurchaseOrders" component={PurchaseOrdersScreen} options={{ headerShown: false, title: 'Purchase Orders' }} />
      <Stack.Screen
        name="CreatePurchaseOrder"
        component={CreatePurchaseOrderScreen}
        options={formSheetOptions(colors, 'New purchase order')}
      />

      <Stack.Screen name="Finance" component={FinanceScreen} options={{ headerShown: false, title: 'Finance' }} />
      <Stack.Screen name="CreateExpense" component={CreateExpenseScreen} options={formSheetOptions(colors, 'New expense')} />

      <Stack.Screen name="SiteFeed" component={SiteFeedScreen} options={{ headerShown: false, title: 'Site Feed' }} />
      <Stack.Screen
        name="PostSiteUpdate"
        component={PostSiteUpdateScreen}
        options={formSheetOptions(colors, 'Post update')}
      />
      <Stack.Screen name="Snags" component={SnagsScreen} options={{ headerShown: false, title: 'Snags' }} />
      <Stack.Screen name="CreateSnag" component={CreateSnagScreen} options={formSheetOptions(colors, 'Log snag')} />

      <Stack.Screen name="Reports" component={ReportsScreen} options={{ headerShown: false, title: 'Reports' }} />
      <Stack.Screen name="Portfolio" component={PortfolioScreen} options={{ headerShown: false, title: 'Portfolio' }} />
      <Stack.Screen name="LiveBoard" component={LiveBoardScreen} options={{ headerShown: false, title: 'Live board' }} />

      <Stack.Screen name="Inventory" component={InventoryScreen} options={{ headerShown: false, title: 'Inventory' }} />
      <Stack.Screen
        name="CreateInventoryItem"
        component={CreateInventoryItemScreen}
        options={formSheetOptions(colors, 'New item')}
      />
      <Stack.Screen name="InventoryMovements" component={InventoryMovementsScreen} options={{ headerShown: false, title: 'Stock Movements' }} />

      <Stack.Screen
        name="CompanyAdminDashboard"
        component={CompanyAdminDashboardScreen}
        options={{ headerShown: false, title: 'Company Dashboard' }}
      />
      <Stack.Screen name="PlatformAdmin" component={PlatformNavigator} options={{ headerShown: false, title: 'Platform' }} />
      <Stack.Screen name="Impact" component={ImpactScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ImpactAdjust"
        component={AdjustPointsScreen}
        options={formSheetOptions(colors, 'Adjust points')}
      />
      <Stack.Screen
        name="ImpactRule"
        component={ImpactRuleScreen}
        options={formSheetOptions(colors, 'Point rule')}
      />
      <Stack.Screen
        name="ImpactPerson"
        component={ImpactPersonScreen}
        options={{ headerShown: false, title: 'Impact profile' }}
      />
      <Stack.Screen name="ProfileHub" component={ProfileNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Billing" component={BillingScreen} options={{ headerShown: false, title: 'Billing' }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ headerShown: false, title: 'Invoice' }} />
      <Stack.Screen name="CreateInvoice" component={CreateInvoiceScreen} options={formSheetOptions(colors, 'Add invoice')} />
      <Stack.Screen name="TaxInvoices" component={TaxInvoicesScreen} options={{ headerShown: false, title: 'Tax invoices' }} />
      <Stack.Screen
        name="ComposeEmail"
        component={ComposeEmailScreen}
        options={formSheetOptions(colors, 'Compose email')}
      />
      <Stack.Screen
        name="TaxInvoiceDetail"
        component={TaxInvoiceDetailScreen}
        options={{ headerShown: false, title: 'Tax invoice' }}
      />
      <Stack.Screen
        name="EditTaxInvoice"
        component={EditTaxInvoiceScreen}
        options={formSheetOptions(colors, 'Edit invoice')}
      />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false, title: 'Alerts' }} />
      <Stack.Screen
        name="AssignedComments"
        component={AssignedCommentsScreen}
        options={{ headerShown: false, title: 'Assigned comments' }}
      />
      <Stack.Screen
        name="CustomFields"
        component={CustomFieldsScreen}
        options={{ headerShown: false, title: 'Custom fields' }}
      />
      <Stack.Screen
        name="Approvals"
        component={ApprovalsScreen}
        options={{ headerShown: false, title: 'Approvals' }}
      />
      <Stack.Screen
        name="CreateApprovalRule"
        component={CreateApprovalRuleScreen}
        options={formSheetOptions(colors, 'Add routing')}
      />
      <Stack.Screen
        name="CreateApprovalType"
        component={CreateApprovalTypeScreen}
        options={formSheetOptions(colors, 'New approval type')}
      />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ headerShown: false, title: 'Task' }} />
      <Stack.Screen name="Docs" component={DocsScreen} options={{ headerShown: false, title: 'Handbook' }} />
      <Stack.Screen name="SiteSupervisor" component={SiteSupervisorScreen} options={{ headerShown: false, title: 'Site mode' }} />
    </Stack.Navigator>
  )
}
