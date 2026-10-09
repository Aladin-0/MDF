'use client';

import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Search, Loader2 } from 'lucide-react';
import { useProductSearch } from '@/hooks/useProductSearch';
import { ProductSearchResult } from '@/types';
import { cn } from '@/lib/utils';

interface ProductSearchDropdownProps {
    onSelect: (product: ProductSearchResult) => void;
    context?: 'purchase' | 'billing' | 'procurement';
    placeholder?: string;
    className?: string;
}

export function ProductSearchDropdown({ onSelect, context = 'purchase', placeholder = "Search products...", className = "" }: ProductSearchDropdownProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeValue, setActiveValue] = useState('');
    
    const { data: searchResults = [], isFetching } = useProductSearch(query, context);

    const handleSelect = (product: ProductSearchResult) => {
        onSelect(product);
        setOpen(false);
        setQuery('');
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-start text-muted-foreground font-normal bg-white rounded-md border border-gray-300 shadow-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 hover:bg-gray-50 transition-colors", className)}
                >
                    <Search className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
                    {placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start">
                <Command 
                    shouldFilter={false} 
                    value={activeValue} 
                    onValueChange={setActiveValue}
                >
                    <CommandInput 
                        placeholder={placeholder} 
                        value={query} 
                        onValueChange={setQuery} 
                    />
                    <CommandList>
                        {isFetching ? (
                            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Searching...
                            </div>
                        ) : (
                            <>
                                {query.length >= 2 && searchResults.length === 0 && (
                                    <CommandEmpty>No products found.</CommandEmpty>
                                )}
                                {searchResults.length > 0 && (
                                    <CommandGroup>
                                        {searchResults.map((product: ProductSearchResult, idx: number) => (
                                            <CommandItem
                                                key={`${product.id}-${idx}`}
                                                value={`${product.id}-${idx}`}
                                                onSelect={() => handleSelect(product)}
                                                className="flex flex-col items-start px-4 py-3 min-h-[48px] cursor-pointer"
                                            >
                                                <div className="font-medium text-slate-800">{product.name}</div>
                                                <div className="text-xs text-slate-500 flex justify-between w-full mt-1">
                                                    <span>{product.manufacturer}</span>
                                                    <span>Pack: {product.packSize || 1} {product.packType || ''}</span>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
