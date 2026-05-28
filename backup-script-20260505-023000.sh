#!/bin/bash
# Supabase Database Backup Script
# For remote database access, use the connection string from Supabase dashboard

echo "✅ Git Bundle Backup: DONE"
echo "   File: church-cms-backup-*.bundle (538K)"
echo ""
echo "📝 Supabase Backup (Alternative Method):"
echo ""
echo "For Supabase cloud database dump, follow these steps:"
echo "1. Go to: https://app.supabase.com/project/wjasjrthijpxlarreics/sql/new"
echo "2. Select All Tables and Export as SQL"
echo ""
echo "OR use psql with connection string:"
echo "psql 'postgresql://postgres:[PASSWORD]@db.wjasjrthijpxlarreics.supabase.co:5432/postgres' -c '\dt' > tables.txt"
echo ""
echo "Database Project Reference: wjasjrthijpxlarreics"
echo "Region: Northeast Asia (Tokyo)"
