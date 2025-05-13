'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FormSchema = z.object({
    email: z.string().email(),
    name: z.string().nonempty(),
    password: z.string().min(6, {
        message: 'Password must be at least 6 characters.',
    }),
});

type FormData = z.infer<typeof FormSchema>;

export default function FormPage() {
    const router = useRouter();
    const [ message, setMessage ] = useState<string | null>(null);
    const form = useForm({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            email: '',
            name: '',
            password: '',
        },
    });

    const { errors } = form.formState;

    const onSubmit = async (data: FormData) => {
        const { email, name, password } = data;

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, name, password }),
            });

            const data = await response.json();
            if (!data.success) {
                if (data.errors) {
                    data.errors.forEach((error: any) => {
                        const field = error.path[0];
                        form.setError(field, {
                            type: 'custom',
                            message: error.message,
                        });
                    })
                }

                throw new Error(data.message || 'Error');
            }

            router.replace('/login');
        } catch (error: any) {
            setMessage(error.message || 'Error');
        }
    };

    return (
        <Form {...form} className="w-2/3 space-y-6">
            {message && <p className="text-red-600">{ message }</p>}
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Email"
                                    type="email"
                                    {...field}
                                />
                            </FormControl>
                            {errors.email && <p className="text-red-600">{ errors.email.message }</p>}
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Name"
                                    type="text"
                                    {...field}
                                />
                            </FormControl>
                            {errors.name && <p className="text-red-600">{ errors.name.message }</p>}
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Password"
                                    type="password"
                                    {...field}
                                />
                            </FormControl>
                            {errors.password && <p className="text-red-600">{ errors.password.message }</p>}
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="bg-cyan-700 hover:bg-cyan-600 text-white"
                    disabled={form.formState.isSubmitting}
                >
                    {form.formState.isSubmitting ? "Registering...." : "Register"}
                </Button>
            </form>
        </Form>
    );
}
