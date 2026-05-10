"""
Migration 0013: Inventory search performance indexes

- Enable pg_trgm PostgreSQL extension (trigram similarity search)
- Add GIN trigram indexes on MasterProduct.name, composition, manufacturer
  → Makes ILIKE/trigram search on 50k products < 5ms instead of full table scan
- Add composite Batch index on (outlet_id, product_id, is_active, expiry_date)
  → Makes per-product batch lookups O(log n) instead of O(n)
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0012_migrate_pack_sizes'),
    ]

    operations = [
        # Enable pg_trgm extension for trigram-based fast text search
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS pg_trgm;",
            reverse_sql="DROP EXTENSION IF EXISTS pg_trgm;",
        ),

        # GIN trigram index on product name — the primary search field
        # Enables "WHERE name ILIKE '%paracet%'" to use index instead of full table scan
        migrations.RunSQL(
            sql="""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_masterproduct_name_trgm
                ON inventory_masterproduct
                USING GIN (name gin_trgm_ops);
            """,
            reverse_sql="DROP INDEX CONCURRENTLY IF EXISTS idx_masterproduct_name_trgm;",
        ),

        # GIN trigram index on composition — for searching by active ingredient
        migrations.RunSQL(
            sql="""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_masterproduct_composition_trgm
                ON inventory_masterproduct
                USING GIN (composition gin_trgm_ops);
            """,
            reverse_sql="DROP INDEX CONCURRENTLY IF EXISTS idx_masterproduct_composition_trgm;",
        ),

        # GIN trigram index on manufacturer — for brand searches
        migrations.RunSQL(
            sql="""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_masterproduct_manufacturer_trgm
                ON inventory_masterproduct
                USING GIN (manufacturer gin_trgm_ops);
            """,
            reverse_sql="DROP INDEX CONCURRENTLY IF EXISTS idx_masterproduct_manufacturer_trgm;",
        ),

        # Composite index on Batch: outlet + product + active status + expiry
        # Covers the exact WHERE clause used in InventoryListView batch lookup
        migrations.RunSQL(
            sql="""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_batch_outlet_product_active_expiry
                ON inventory_batch (outlet_id, product_id, is_active, expiry_date)
                WHERE is_active = true;
            """,
            reverse_sql="DROP INDEX CONCURRENTLY IF EXISTS idx_batch_outlet_product_active_expiry;",
        ),

        # Index for fast subquery: "which products have stock at this outlet?"
        migrations.RunSQL(
            sql="""
                CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_batch_outlet_product_active
                ON inventory_batch (outlet_id, product_id)
                WHERE is_active = true;
            """,
            reverse_sql="DROP INDEX CONCURRENTLY IF EXISTS idx_batch_outlet_product_active;",
        ),
    ]
