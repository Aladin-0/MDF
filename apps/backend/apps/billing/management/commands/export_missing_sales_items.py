import pandas as pd
from django.core.management.base import BaseCommand
from django.db.models import Sum, Count
from apps.inventory.models import MasterProduct, Batch
from apps.billing.models import SaleItem

class Command(BaseCommand):
    help = 'Export missing products (Dummy created during import) to an Excel file.'

    def handle(self, *args, **options):
        # We find all MasterProducts that were created during the import
        # We tagged them with manufacturer='Unknown Migration'
        dummy_products = MasterProduct.objects.filter(manufacturer='Unknown Migration')
        
        data = []
        for product in dummy_products:
            # Get all sale items associated with this product's batches
            items = SaleItem.objects.filter(product_name=product.name)
            
            # Aggregate data
            stats = items.aggregate(
                total_value=Sum('total_amount'),
                times_sold=Count('id')
            )
            
            # Get the batch number used (if any)
            batch = Batch.objects.filter(product=product).first()
            batch_no = batch.batch_no if batch else 'UNKNOWN'
            
            data.append({
                'Product Name': product.name,
                'Missing Batch No': batch_no,
                'Item Price (Rate)': float(product.mrp),
                'Times Missing / Sold': stats['times_sold'] or 0,
                'Total Value Lost (INR)': float(stats['total_value'] or 0)
            })

        if not data:
            self.stdout.write("No missing products found!")
            return

        df = pd.DataFrame(data)
        # Sort by total value lost
        df = df.sort_values(by='Total Value Lost (INR)', ascending=False)
        
        output_file = 'Missing_Sales_Items_Report.xlsx'
        df.to_excel(output_file, index=False)
        self.stdout.write(self.style.SUCCESS(f"Successfully generated {output_file} with {len(df)} missing products!"))
