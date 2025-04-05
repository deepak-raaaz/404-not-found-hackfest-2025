'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useSearchParams } from 'next/navigation';
import { useCreateFeedbackMutation, useUpdateFeedbackMutation, useGetFeedbackByIdQuery } from '@/redux/features/api/feedback/feedbackApi';
import { useGetEventsByUserIdQuery } from '@/redux/features/api/event/eventApi';
import { useSelector } from 'react-redux';

// Define interfaces
interface FormField {
  id: string;
  type: 'text' | 'rating' | 'multiSelect' | 'hashtags' | 'anonymous';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  tags?: string[];
}

interface FeedbackData {
  eventId: string;
  submittedBy?: string;
  isAnonymous: boolean;
  formFields: Record<string, { value: null; field: FormField }>;
  status: 'draft' | 'submitted';
  title?: string;
  description?: string;
}

interface User {
  _id: string;
}

interface Event {
  _id: string;
  name: string;
  startDate?: string;
}

const FormBuilder = () => {
  const searchParams = useSearchParams();
  const eventIdFromParams = searchParams.get('eventId');
  const feedbackId = searchParams.get('feedbackId');
  const { user } = useSelector((state: { auth: { user: User | null } }) => state.auth);

  const [createFeedback, { isLoading: isCreating, error: createError }] = useCreateFeedbackMutation();
  const [updateFeedback, { isLoading: isUpdating, error: updateError }] = useUpdateFeedbackMutation();
  const { data: existingFeedback, isLoading: isLoadingFeedback } = useGetFeedbackByIdQuery(feedbackId ?? '', {
    skip: !feedbackId,
  });
  const { data: eventsResponse, isLoading: isLoadingEvents, error: eventsError } = useGetEventsByUserIdQuery(user?._id ?? '', {
    skip: !user?._id,
  });
  const events: Event[] = eventsResponse?.data ?? [];

  const [formTitle, setFormTitle] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [isAddingField, setIsAddingField] = useState<boolean>(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Load existing feedback
  useEffect(() => {
    if (existingFeedback && feedbackId) {
      setFormTitle(existingFeedback.title ?? '');
      setFormDescription(existingFeedback.description ?? '');
      const loadedFields = Object.values(existingFeedback.formFields ?? {}).map((fieldData: any) => ({
        id: fieldData.field.id,
        type: fieldData.field.type,
        label: fieldData.field.label,
        required: fieldData.field.required,
        options: fieldData.field.options,
        placeholder: fieldData.field.placeholder,
        tags: fieldData.field.tags,
      }));
      setFields(loadedFields);
      setSelectedEventId(existingFeedback.eventId.toString());
    }
  }, [existingFeedback, feedbackId]);

  // Set event from URL params
  useEffect(() => {
    if (events.length > 0 && eventIdFromParams && !selectedEventId) {
      const eventExists = events.some(event => event._id === eventIdFromParams);
      if (eventExists) setSelectedEventId(eventIdFromParams);
    }
  }, [events, eventIdFromParams, selectedEventId]);

  const handleAddField = useCallback((type: FormField['type']) => {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      type,
      label: `New ${type} Field`, // Default label to satisfy schema
      required: false,
      ...(type === 'multiSelect' && { options: ['Option 1'] }),
      ...(type === 'text' && { placeholder: 'Enter your answer' }),
      ...(type === 'hashtags' && { tags: [] }),
    };
    setFields(prev => [...prev, newField]);
    setIsAddingField(false);
  }, []);

  const handleFieldUpdate = useCallback((index: number, updates: Partial<FormField>) => {
    setFields(prev => {
      const updatedFields = [...prev];
      updatedFields[index] = { ...updatedFields[index], ...updates };
      return updatedFields;
    });
  }, []);

  const handleRemoveField = useCallback((index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    setFields(prev => {
      const items = [...prev];
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination!.index, 0, reorderedItem);
      return items;
    });
  }, []);

  const validateForm = (): string | null => {
    if (!selectedEventId) return 'Please select an event.';
    if (!user?._id) return 'User authentication required.';
    if (fields.length === 0) return 'Please add at least one field.';
    const invalidField = fields.find(field => !field.label.trim());
    if (invalidField) return 'All fields must have a non-empty label.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    const formFields = fields.reduce((acc, field) => {
      acc[field.id] = {
        value: null,
        field: { ...field },
      };
      return acc;
    }, {} as FeedbackData['formFields']);

    const feedbackData: FeedbackData = {
      eventId: selectedEventId!,
      submittedBy: user!._id,
      isAnonymous: fields.some(f => f.type === 'anonymous'),
      formFields,
      status: 'draft',
      title: formTitle || undefined,
      description: formDescription || undefined,
    };

    try {
      if (feedbackId) {
        await updateFeedback({ id: feedbackId, ...feedbackData }).unwrap();
        alert('Form updated successfully!');
      } else {
        await createFeedback(feedbackData).unwrap();
        alert('Form saved successfully!');
      }
    } catch (err) {
      console.error('Error saving form:', err);
      const errorMessage = createError || updateError
        ? JSON.stringify((createError || updateError) as any || 'Unknown error')
        : 'Error saving form. Please try again.';
      alert(errorMessage);
    }
  };

  // Loading state
  if (isLoadingEvents || (feedbackId && isLoadingFeedback)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    );
  }

  // Error state
  if (eventsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error loading events. Please try again later.</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Form Builder</h1>
        <p className="text-gray-400">Create a custom feedback form with various input types</p>
      </div>

      {/* Event Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Select an Event</label>
        <select
          value={selectedEventId ?? ''}
          onChange={e => setSelectedEventId(e.target.value || null)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Choose an event</option>
          {events.map((event:any) => (
            <option key={event.eventId._id} value={event.eventId._id}>
              {event.eventId.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-6">
        <div className="bg-gray-800/80 p-6 rounded-xl border border-gray-700/30">
          <input
            type="text"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            placeholder="Form Title"
            className="w-full bg-transparent text-xl font-bold border-none focus:outline-none focus:ring-0 mb-4"
          />
          <textarea
            value={formDescription}
            onChange={e => setFormDescription(e.target.value)}
            placeholder="Form Description"
            className="w-full bg-transparent text-gray-400 border-none focus:outline-none focus:ring-0 resize-none"
            rows={2}
          />
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="form-fields">
            {provided => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                {fields.map((field, index) => (
                  <Draggable key={field.id} draggableId={field.id} index={index}>
                    {provided => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="bg-gray-800/80 p-6 rounded-xl border border-gray-700/30 group"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div {...provided.dragHandleProps} className="cursor-move p-2 hover:bg-gray-700/50 rounded">
                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => handleFieldUpdate(index, { required: e.target.checked })}
                                className="rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500/20"
                              />
                              Required
                            </label>
                            <button
                              onClick={() => handleRemoveField(index)}
                              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <input
                            type="text"
                            value={field.label}
                            onChange={e => handleFieldUpdate(index, { label: e.target.value })}
                            placeholder="Question"
                            className="w-full bg-gray-700 rounded-lg px-4 py-2 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />

                          {field.type === 'text' && (
                            <input
                              type="text"
                              value={field.placeholder ?? ''}
                              onChange={e => handleFieldUpdate(index, { placeholder: e.target.value })}
                              placeholder="Placeholder text"
                              className="w-full bg-gray-700 rounded-lg px-4 py-2 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          )}

                          {field.type === 'rating' && (
                            <div className="flex items-center gap-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button key={star} className="text-2xl text-yellow-400 cursor-default">
                                  ★
                                </button>
                              ))}
                            </div>
                          )}

                          {field.type === 'multiSelect' && (
                            <div className="space-y-2">
                              {field.options?.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={e => {
                                      const newOptions = [...(field.options ?? [])];
                                      newOptions[optionIndex] = e.target.value;
                                      handleFieldUpdate(index, { options: newOptions });
                                    }}
                                    placeholder={`Option ${optionIndex + 1}`}
                                    className="flex-1 bg-gray-700 rounded-lg px-4 py-2 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  />
                                  <button
                                    onClick={() => {
                                      const newOptions = (field.options ?? []).filter((_, i) => i !== optionIndex);
                                      handleFieldUpdate(index, { options: newOptions });
                                    }}
                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded"
                                  >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => {
                                  const newOptions = [...(field.options ?? []), `Option ${(field.options?.length ?? 0) + 1}`];
                                  handleFieldUpdate(index, { options: newOptions });
                                }}
                                className="text-sm text-indigo-400 hover:text-indigo-300"
                              >
                                + Add Option
                              </button>
                            </div>
                          )}

                          {field.type === 'hashtags' && (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                {field.tags?.map((tag, tagIndex) => (
                                  <span
                                    key={tagIndex}
                                    className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-full text-sm flex items-center gap-2"
                                  >
                                    #{tag}
                                    <button
                                      onClick={() => {
                                        const newTags = (field.tags ?? []).filter((_, i) => i !== tagIndex);
                                        handleFieldUpdate(index, { tags: newTags });
                                      }}
                                      className="hover:text-red-400"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Type and press Enter to add tags"
                                  className="flex-1 bg-gray-700 rounded-lg px-4 py-2 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const input = e.currentTarget;
                                      const tag = input.value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
                                      if (tag && !field.tags?.includes(tag)) {
                                        const newTags = [...(field.tags ?? []), tag];
                                        handleFieldUpdate(index, { tags: newTags });
                                        input.value = '';
                                      }
                                    }
                                  }}
                                />
                              </div>
                              <p className="text-xs text-gray-400">Press Enter to add a tag. Only letters, numbers, and underscores allowed.</p>
                            </div>
                          )}

                          {field.type === 'anonymous' && (
                            <div className="flex items-center gap-2 text-gray-400">
                              <input
                                type="checkbox"
                                className="rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500/20"
                                disabled
                              />
                              <span>Submit anonymously</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="flex justify-between items-center">
          <div className="relative">
            <button
              onClick={() => setIsAddingField(prev => !prev)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Field
            </button>
            {isAddingField && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700/30 overflow-hidden z-10">
                {(['text', 'rating', 'multiSelect', 'hashtags', 'anonymous'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => handleAddField(type)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-700/50 text-sm"
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)} {type === 'rating' ? '(5 Stars)' : 'Option'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={isCreating || isUpdating}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating || isUpdating ? (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {feedbackId ? 'Update Form' : 'Save Form'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FormBuilder;